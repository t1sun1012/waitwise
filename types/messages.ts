import type { ConversationContext, CorpusChunkType, CorpusSource } from './rag';

export type QuizMode = 'retrieval' | 'math' | 'general';
export type QuizProvider = 'gemini' | 'openai' | 'anthropic';
export type QuizQuestionType =
  | 'concept_check'
  | 'application'
  | 'misconception'
  | 'category'
  | 'history';

export interface QuizSource {
  id: string;
  corpus: string;
  category: string;
  subcategory?: string;
  chunkType?: CorpusChunkType;
  createdAt?: string;
  title: string;
  question: string;
  answer: string;
  tags: string[];
  source: CorpusSource;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  mode?: QuizMode;
  topic?: string;
  questionType?: QuizQuestionType;
  contextNote?: string;
  explanation?: string;
  source?: QuizSource;
}

export interface QuizAttempt {
  id: string;
  questionId: string;
  answeredAt: number;
  question: string;
  options: string[];
  correctIndex: number;
  correctOption: string;
  selectedIndex: number;
  selectedOption: string;
  isCorrect: boolean;
  mode?: QuizMode;
  topic?: string;
  questionType?: QuizQuestionType;
  contextNote?: string;
  explanation?: string;
  source?: QuizSource;
}

export type Message =
  | { type: 'GENERATION_STARTED'; prompt: string }
  | { type: 'GENERATION_ENDED' }
  | {
      type: 'GET_QUIZ';
      currentPrompt?: string;
      retrievalQuery?: string;
      retrievalContext?: ConversationContext;
      recentUserPrompts?: string[];
    }
  | {
      type: 'QUIZ_ANSWERED';
      question: QuizQuestion;
      selectedIndex: number;
    }
  | { type: 'QUIZ_SKIPPED' };

export interface UserStats {
  quizzesShown: number;
  quizzesAnswered: number;
  correctAnswers: number;
  streak: number;
}
