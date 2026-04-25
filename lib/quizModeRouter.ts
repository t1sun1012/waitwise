import type { QuizMode, QuizProvider, QuizQuestion } from '../types/messages';
import type { ConversationContext, RankedRetrievedChunk } from '../types/rag';
import { getRagCorpus } from './rag/corpus';
import { mathGenerator } from '../quiz/mathGenerator';
import {
  hasConfidentRetrievalMatch,
  retrievalQuizGenerator,
} from '../quiz/retrievalGenerator';
import {
  generateGeneralQuiz,
  generateMathQuiz,
  generateRetrievalQuiz,
} from './providers';

export interface ResolveQuizForModeInput {
  quizMode: QuizMode;
  quizProvider: QuizProvider;
  providerApiKey: string;
  retrievedChunks: RankedRetrievedChunk[];
  retrievalContext?: ConversationContext;
  currentPrompt?: string;
  recentUserPrompts?: string[];
  recentSourceIds?: string[];
}

export interface ResolveQuizForModeResult {
  question: QuizQuestion;
  fallbackReason?: string;
}

interface ResolveQuizForModeDependencies {
  generateRetrievalQuiz?: typeof generateRetrievalQuiz;
  generateGeneralQuiz?: typeof generateGeneralQuiz;
  generateMathQuiz?: typeof generateMathQuiz;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandomRetrievedChunk(
  recentSourceIds: string[] = []
): RankedRetrievedChunk | null {
  const recentSourceIdSet = new Set(recentSourceIds);
  const corpus = getRagCorpus();
  if (corpus.length === 0) return null;

  const availableCorpus = corpus.filter(
    (chunk) => !recentSourceIdSet.has(chunk.id)
  );
  const pool = availableCorpus.length > 0 ? availableCorpus : corpus;
  const chunk = pool[randomInt(0, pool.length - 1)];
  if (!chunk) return null;

  return {
    chunk,
    score: 0,
    signals: [],
  };
}

export async function resolveQuizForMode(
  input: ResolveQuizForModeInput,
  dependencies: ResolveQuizForModeDependencies = {}
): Promise<ResolveQuizForModeResult> {
  const {
    quizMode,
    quizProvider,
    providerApiKey,
    retrievedChunks,
    retrievalContext,
    currentPrompt,
    recentUserPrompts = [],
    recentSourceIds = [],
  } = input;
  const retrievalGenerator =
    dependencies.generateRetrievalQuiz ?? generateRetrievalQuiz;
  const generalGenerator = dependencies.generateGeneralQuiz ?? generateGeneralQuiz;
  const mathProviderGenerator = dependencies.generateMathQuiz ?? generateMathQuiz;

  if (quizMode === 'math') {
    if (!providerApiKey) {
      return {
        question: mathGenerator.generate(),
        fallbackReason: 'math-missing-api-key',
      };
    }

    const providerQuestion = await mathProviderGenerator({
      provider: quizProvider,
      apiKey: providerApiKey,
      currentPrompt,
    });

    if (providerQuestion) {
      return { question: providerQuestion };
    }

    return {
      question: mathGenerator.generate(),
      fallbackReason: 'math-provider-failed',
    };
  }

  if (quizMode === 'general') {
    if (!providerApiKey) {
      return {
        question: mathGenerator.generate(),
        fallbackReason: 'general-missing-api-key',
      };
    }

    if (!currentPrompt?.trim()) {
      return {
        question: mathGenerator.generate(),
        fallbackReason: 'general-missing-prompt',
      };
    }

    const generalQuestion = await generalGenerator({
      provider: quizProvider,
      apiKey: providerApiKey,
      currentPrompt,
      recentUserPrompts,
    });

    if (!generalQuestion) {
      return {
        question: mathGenerator.generate(),
        fallbackReason: 'general-provider-failed',
      };
    }

    return { question: generalQuestion };
  }

  if (!providerApiKey) {
    const localFallback = retrievalQuizGenerator.generate(retrievedChunks, {
      recentSourceIds,
    });
    return {
      question: localFallback ?? mathGenerator.generate(),
      fallbackReason: 'retrieval-missing-api-key',
    };
  }

  if (!hasConfidentRetrievalMatch(retrievedChunks)) {
    const randomRetrievedChunk = pickRandomRetrievedChunk(recentSourceIds);
    if (randomRetrievedChunk) {
      const randomTopicQuestion = await retrievalGenerator({
        provider: quizProvider,
        apiKey: providerApiKey,
        retrievalContext,
        retrievedChunks: [randomRetrievedChunk],
      });

      if (randomTopicQuestion) {
        return {
          question: randomTopicQuestion,
          fallbackReason: 'retrieval-random-topic',
        };
      }
    }

    const localFallback = retrievalQuizGenerator.generate(retrievedChunks, {
      recentSourceIds,
    });
    return {
      question: localFallback ?? mathGenerator.generate(),
      fallbackReason: 'retrieval-low-confidence',
    };
  }

  const retrievalQuestion = await retrievalGenerator({
    provider: quizProvider,
    apiKey: providerApiKey,
    retrievalContext,
    retrievedChunks,
  });

  if (retrievalQuestion) {
    return { question: retrievalQuestion };
  }

  const localFallback = retrievalQuizGenerator.generate(retrievedChunks, {
    recentSourceIds,
  });
  return {
    question: localFallback ?? mathGenerator.generate(),
    fallbackReason: 'retrieval-provider-failed',
  };
}
