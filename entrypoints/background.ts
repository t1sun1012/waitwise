import { resolveQuizForMode } from '../lib/quizModeRouter';
import { retrieveRelevantChunks } from '../lib/rag/retriever';
import {
  getProviderApiKey,
  getRecentQuizSourceIds,
  getQuizMode,
  getQuizProvider,
  recordAnswer,
  recordQuizShown,
} from '../lib/storage';
import type { Message } from '../types/messages';
import type { ConversationContext, RankedRetrievedChunk } from '../types/rag';

const RETRIEVAL_TOP_K = 6;
const RECENT_SOURCE_PENALTY = 6;
const RECENT_SOURCE_HISTORY = 5;
const QUERY_POSITION_WEIGHTS = [1.35, 1.15, 1];

function diversifyRetrievedChunks<
  T extends { chunk: { id: string }; score: number }
>(retrievedChunks: T[], recentSourceIds: string[]): T[] {
  if (recentSourceIds.length === 0) {
    return retrievedChunks;
  }

  const recentSourceIdSet = new Set(recentSourceIds);

  return [...retrievedChunks].sort((left, right) => {
    const leftAdjustedScore =
      left.score - (recentSourceIdSet.has(left.chunk.id) ? RECENT_SOURCE_PENALTY : 0);
    const rightAdjustedScore =
      right.score - (recentSourceIdSet.has(right.chunk.id) ? RECENT_SOURCE_PENALTY : 0);

    if (rightAdjustedScore !== leftAdjustedScore) {
      return rightAdjustedScore - leftAdjustedScore;
    }

    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return left.chunk.id.localeCompare(right.chunk.id);
  });
}

function phraseInText(text: string, phrase: string): boolean {
  const normalizedText = text.toLowerCase();
  const normalizedPhrase = phrase.toLowerCase();
  return ` ${normalizedText} `.includes(` ${normalizedPhrase} `);
}

function contextFitBonus(
  chunk: RankedRetrievedChunk['chunk'],
  conversationContext?: ConversationContext
): number {
  if (!conversationContext) return 0;

  const searchableText = [
    chunk.title,
    chunk.question,
    chunk.answer,
    chunk.text,
    chunk.category,
    chunk.subcategory,
    ...chunk.tags,
    ...chunk.keywords,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  let bonus = 0;

  conversationContext.entities.forEach((entity) => {
    if (phraseInText(searchableText, entity)) {
      bonus += 3;
    }
  });

  conversationContext.relatedConcepts.forEach((concept) => {
    if (phraseInText(searchableText, concept)) {
      bonus += 1.5;
    }
  });

  if (
    conversationContext.intent === 'compare' &&
    /difference|compare|versus|major differences/.test(searchableText)
  ) {
    bonus += 2;
  }

  if (
    conversationContext.intent === 'example' &&
    /example|application|use case|used/.test(searchableText)
  ) {
    bonus += 1.5;
  }

  return bonus;
}

function retrieveRelevantChunksForContext(
  conversationContext: ConversationContext | undefined,
  recentSourceIds: string[]
): RankedRetrievedChunk[] {
  const queries =
    conversationContext?.retrievalQueries.filter(Boolean) ?? [];

  if (queries.length === 0) {
    return [];
  }

  const combined = new Map<string, RankedRetrievedChunk>();

  queries.forEach((query, index) => {
    const queryWeight = QUERY_POSITION_WEIGHTS[index] ?? 1;
    const results = retrieveRelevantChunks(query, {
      topK: RETRIEVAL_TOP_K,
    });

    results.forEach((result) => {
      const weightedScore =
        result.score * queryWeight +
        contextFitBonus(result.chunk, conversationContext);
      const existing = combined.get(result.chunk.id);

      if (existing) {
        existing.score += weightedScore;
        const signalKeys = new Set(
          existing.signals.map((signal) => `${signal.kind}:${signal.value}`)
        );
        result.signals.forEach((signal) => {
          const key = `${signal.kind}:${signal.value}`;
          if (signalKeys.has(key)) return;
          existing.signals.push(signal);
          signalKeys.add(key);
        });
        return;
      }

      combined.set(result.chunk.id, {
        chunk: result.chunk,
        score: weightedScore,
        signals: [...result.signals],
      });
    });
  });

  return diversifyRetrievedChunks(
    [...combined.values()].sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.chunk.id.localeCompare(right.chunk.id);
    }),
    recentSourceIds
  ).slice(0, RETRIEVAL_TOP_K);
}

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
    (async () => {
      switch (message.type) {
        case 'GET_QUIZ': {
          const recentSourceIds = await getRecentQuizSourceIds(RECENT_SOURCE_HISTORY);
          const retrievedChunks = retrieveRelevantChunksForContext(
            message.retrievalContext,
            recentSourceIds
          );
          const quizMode = await getQuizMode();

          if (message.retrievalContext) {
            console.log('[wAItwise] Retrieval context summary:', message.retrievalContext.summary);
            console.log(
              '[wAItwise] Retrieval queries:',
              message.retrievalContext.retrievalQueries
            );
            if (recentSourceIds.length > 0) {
              console.log('[wAItwise] Recent quiz source ids:', recentSourceIds);
            }
            console.log(
              '[wAItwise] Top retrieved chunks:',
              retrievedChunks.map((result) => ({
                id: result.chunk.id,
                score: result.score,
                title: result.chunk.title,
                signals: result.signals,
              }))
            );
          }

          await recordQuizShown();
          const [quizProvider, providerApiKey] = await Promise.all([
            getQuizProvider(),
            getProviderApiKey(),
          ]);
          const { question, fallbackReason } = await resolveQuizForMode({
            quizMode,
            quizProvider,
            providerApiKey,
            retrievedChunks,
            retrievalContext: message.retrievalContext,
            currentPrompt: message.currentPrompt,
            recentUserPrompts: message.recentUserPrompts,
            recentSourceIds,
          });

          if (fallbackReason === 'retrieval-missing-api-key') {
            console.log(
              `[wAItwise] ${quizProvider} API key not set, using local retrieval fallback`
            );
          } else if (fallbackReason === 'retrieval-low-confidence') {
            console.log(
              `[wAItwise] Retrieval match not confident enough for ${quizProvider}, using local fallback`
            );
          } else if (fallbackReason === 'retrieval-random-topic') {
            console.log(
              `[wAItwise] Retrieval match not confident enough for ${quizProvider}, generated from a random RAG topic`
            );
          } else if (fallbackReason === 'retrieval-provider-failed') {
            console.log(
              `[wAItwise] ${quizProvider} retrieval generation failed, using local retrieval fallback`
            );
          } else if (fallbackReason === 'general-missing-api-key') {
            console.log(
              `[wAItwise] General mode requires a ${quizProvider} API key, using math fallback`
            );
          } else if (fallbackReason === 'general-missing-prompt') {
            console.log(
              '[wAItwise] General mode missing current prompt, using math fallback'
            );
          } else if (fallbackReason === 'general-provider-failed') {
            console.log(
              `[wAItwise] ${quizProvider} general generation failed, using math fallback`
            );
          } else if (fallbackReason === 'math-missing-api-key') {
            console.log(
              `[wAItwise] Math mode has no ${quizProvider} API key, using local math fallback`
            );
          } else if (fallbackReason === 'math-provider-failed') {
            console.log(
              `[wAItwise] ${quizProvider} math generation failed, using local math fallback`
            );
          }

          if (quizMode === 'retrieval' && question.contextNote) {
            console.log(
              '[wAItwise] Retrieval quiz fallback -> random RAG question',
              retrievedChunks[0]
                ? {
                    topChunkId: retrievedChunks[0].chunk.id,
                    topScore: retrievedChunks[0].score,
                    secondScore: retrievedChunks[1]?.score ?? null,
                  }
                : { topChunkId: null, topScore: null, secondScore: null }
            );
          }

          console.log('[wAItwise] Active quiz mode:', quizMode);
          console.log('[wAItwise] Active quiz provider:', quizProvider);
          sendResponse({ question, retrievedChunks });
          break;
        }
        case 'QUIZ_ANSWERED': {
          const result = await recordAnswer(
            message.question,
            message.selectedIndex
          );
          sendResponse(result);
          break;
        }
        case 'QUIZ_SKIPPED': {
          sendResponse({});
          break;
        }
        default:
          sendResponse({});
      }
    })();
    return true; // keep channel open for async response
  });
});
