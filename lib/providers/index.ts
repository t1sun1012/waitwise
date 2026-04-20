import type { QuizProvider, QuizQuestion } from '../../types/messages';
import type { ConversationContext, RankedRetrievedChunk } from '../../types/rag';
import {
  generateGeneralQuizWithAnthropic,
  generateMathQuizWithAnthropic,
  generateRetrievalQuizWithAnthropic,
} from './anthropic';
import {
  generateGeneralQuizWithGemini,
  generateMathQuizWithGemini,
  generateRetrievalQuizWithGemini,
} from './gemini';
import {
  generateGeneralQuizWithOpenAI,
  generateMathQuizWithOpenAI,
  generateRetrievalQuizWithOpenAI,
} from './openai';

export interface ProviderRetrievalQuizParams {
  provider: QuizProvider;
  apiKey: string;
  retrievalContext?: ConversationContext;
  retrievedChunks: RankedRetrievedChunk[];
}

export interface ProviderGeneralQuizParams {
  provider: QuizProvider;
  apiKey: string;
  currentPrompt: string;
  recentUserPrompts?: string[];
}

export interface ProviderMathQuizParams {
  provider: QuizProvider;
  apiKey: string;
  currentPrompt?: string;
}

const RETRIEVAL_GENERATORS = {
  gemini: generateRetrievalQuizWithGemini,
  openai: generateRetrievalQuizWithOpenAI,
  anthropic: generateRetrievalQuizWithAnthropic,
} satisfies Record<
  QuizProvider,
  (params: Omit<ProviderRetrievalQuizParams, 'provider'>) => Promise<QuizQuestion | null>
>;

const GENERAL_GENERATORS = {
  gemini: generateGeneralQuizWithGemini,
  openai: generateGeneralQuizWithOpenAI,
  anthropic: generateGeneralQuizWithAnthropic,
} satisfies Record<
  QuizProvider,
  (params: Omit<ProviderGeneralQuizParams, 'provider'>) => Promise<QuizQuestion | null>
>;

const MATH_GENERATORS = {
  gemini: generateMathQuizWithGemini,
  openai: generateMathQuizWithOpenAI,
  anthropic: generateMathQuizWithAnthropic,
} satisfies Record<
  QuizProvider,
  (params: Omit<ProviderMathQuizParams, 'provider'>) => Promise<QuizQuestion | null>
>;

export async function generateRetrievalQuiz(
  params: ProviderRetrievalQuizParams
): Promise<QuizQuestion | null> {
  const { provider, ...rest } = params;
  return RETRIEVAL_GENERATORS[provider](rest);
}

export async function generateGeneralQuiz(
  params: ProviderGeneralQuizParams
): Promise<QuizQuestion | null> {
  const { provider, ...rest } = params;
  return GENERAL_GENERATORS[provider](rest);
}

export async function generateMathQuiz(
  params: ProviderMathQuizParams
): Promise<QuizQuestion | null> {
  const { provider, ...rest } = params;
  return MATH_GENERATORS[provider](rest);
}
