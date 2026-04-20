import type { QuizMode, QuizProvider, QuizQuestion } from '../types/messages';
import type { ConversationContext, RankedRetrievedChunk } from '../types/rag';
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
