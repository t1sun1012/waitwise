export type Message =
  | { type: 'GENERATION_STARTED'; prompt: string }
  | { type: 'GENERATION_ENDED' }
  | { type: 'GET_QUIZ' }
  | { type: 'QUIZ_ANSWERED'; correct: boolean }
  | { type: 'QUIZ_SKIPPED' };

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

export interface UserStats {
  quizzesShown: number;
  quizzesAnswered: number;
  correctAnswers: number;
  streak: number;
}
