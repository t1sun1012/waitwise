import type { QuizMode, QuizProvider, QuizQuestion } from '../types/messages';
import type { ConversationContext, RankedRetrievedChunk } from '../types/rag';
import { getRagCorpus } from './rag/corpus';
import { hasConfidentRetrievalMatch } from './rag/retriever';
import { mathGenerator } from '../quiz/mathGenerator';
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
  const providerRetrievalGenerator =
    dependencies.generateRetrievalQuiz ?? generateRetrievalQuiz;
  const generalGenerator = dependencies.generateGeneralQuiz ?? generateGeneralQuiz;
  const mathProviderGenerator = dependencies.generateMathQuiz ?? generateMathQuiz;
  async function generateRandomTopicQuestion(): Promise<QuizQuestion | null> {
    const randomRetrievedChunk = pickRandomRetrievedChunk(recentSourceIds);
    if (!randomRetrievedChunk) return null;

    return providerRetrievalGenerator({
      provider: quizProvider,
      apiKey: providerApiKey,
      retrievalContext,
      retrievedChunks: [randomRetrievedChunk],
    });
  }

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
    return {
      question: mathGenerator.generate(),
      fallbackReason: 'retrieval-missing-api-key',
    };
  }

  if (!hasConfidentRetrievalMatch(retrievedChunks)) {
    const randomTopicQuestion = await generateRandomTopicQuestion();
    if (randomTopicQuestion) {
      return {
        question: randomTopicQuestion,
        fallbackReason: 'retrieval-random-topic',
      };
    }

    return {
      question: mathGenerator.generate(),
      fallbackReason: 'retrieval-random-topic-provider-failed',
    };
  }

  const retrievalQuestion = await providerRetrievalGenerator({
    provider: quizProvider,
    apiKey: providerApiKey,
    retrievalContext,
    retrievedChunks,
  });

  if (retrievalQuestion) {
    return { question: retrievalQuestion };
  }

  const randomTopicQuestion = await generateRandomTopicQuestion();
  if (randomTopicQuestion) {
    return {
      question: randomTopicQuestion,
      fallbackReason: 'retrieval-provider-failed-random-topic',
    };
  }

  return {
    question: mathGenerator.generate(),
    fallbackReason: 'retrieval-provider-failed',
  };
}
