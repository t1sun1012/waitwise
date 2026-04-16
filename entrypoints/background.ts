import { mathGenerator } from '../quiz/mathGenerator';
import {
  hasConfidentRetrievalMatch,
  retrievalQuizGenerator,
} from '../quiz/retrievalGenerator';
import { generateQuizWithGemini } from '../lib/providers/gemini';
import { retrieveRelevantChunks } from '../lib/rag/retriever';
import {
  getGeminiApiKey,
  getRecentQuizSourceIds,
  getQuizMode,
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
          let retrievalQuestion = null;

          if (quizMode === 'retrieval') {
            const geminiApiKey = await getGeminiApiKey();
            const hasConfidentMatch = hasConfidentRetrievalMatch(retrievedChunks);

            if (!geminiApiKey) {
              console.log(
                '[wAItwise] Gemini API key not set, using local retrieval fallback'
              );
            } else if (!hasConfidentMatch) {
              console.log(
                '[wAItwise] Retrieval match not confident enough for Gemini, using local fallback'
              );
            } else {
              retrievalQuestion = await generateQuizWithGemini({
                apiKey: geminiApiKey,
                retrievalContext: message.retrievalContext,
                retrievedChunks,
              });
            }

            if (!retrievalQuestion) {
              retrievalQuestion = retrievalQuizGenerator.generate(retrievedChunks, {
                recentSourceIds,
              });
            }
          }

          if (quizMode === 'retrieval' && retrievalQuestion?.contextNote) {
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

          const question =
            quizMode === 'retrieval'
              ? retrievalQuestion ?? mathGenerator.generate()
              : mathGenerator.generate();

          console.log('[wAItwise] Active quiz mode:', quizMode);
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
