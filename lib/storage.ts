import type {
  QuizAttempt,
  QuizMode,
  QuizProvider,
  QuizQuestion,
  QuizQuestionType,
  QuizSource,
  UserStats,
} from '../types/messages';
import { hydratePetState } from './petEngine';
import type { PetState } from '../types/pet';

const DEFAULT_STATS: UserStats = {
  quizzesShown: 0,
  quizzesAnswered: 0,
  correctAnswers: 0,
  streak: 0,
};
const DEFAULT_QUIZ_MODE: QuizMode = 'retrieval';
const DEFAULT_QUIZ_PROVIDER: QuizProvider = 'gemini';
const MAX_QUIZ_ATTEMPTS = 100;
const LEGACY_GEMINI_API_KEY_STORAGE_KEY = 'geminiApiKey';
const PROVIDER_API_KEY_STORAGE_KEY = 'providerApiKey';
const QUIZ_PROVIDER_STORAGE_KEY = 'quizProvider';
const QUIZ_QUESTION_TYPES: QuizQuestionType[] = [
  'concept_check',
  'application',
  'misconception',
  'category',
  'history',
];
const QUIZ_PROVIDERS: QuizProvider[] = ['gemini', 'openai', 'anthropic'];

export interface WidgetPosition {
  top: number;
  left: number;
}

function isWidgetPosition(value: unknown): value is WidgetPosition {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<WidgetPosition>;
  return (
    typeof candidate.top === 'number' &&
    Number.isFinite(candidate.top) &&
    typeof candidate.left === 'number' &&
    Number.isFinite(candidate.left)
  );
}

function isQuizMode(value: unknown): value is QuizMode {
  return value === 'retrieval' || value === 'math' || value === 'general';
}

function isQuizProvider(value: unknown): value is QuizProvider {
  return (
    typeof value === 'string' &&
    QUIZ_PROVIDERS.includes(value as QuizProvider)
  );
}

function isQuizQuestionType(value: unknown): value is QuizQuestionType {
  return (
    typeof value === 'string' &&
    QUIZ_QUESTION_TYPES.includes(value as QuizQuestionType)
  );
}

function isQuizSource(value: unknown): value is QuizSource {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<QuizSource>;
  const source = candidate.source as Partial<QuizSource['source']> | undefined;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.corpus === 'string' &&
    typeof candidate.category === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.question === 'string' &&
    typeof candidate.answer === 'string' &&
    Array.isArray(candidate.tags) &&
    candidate.tags.every((tag) => typeof tag === 'string') &&
    !!source &&
    typeof source.repo === 'string' &&
    typeof source.path === 'string' &&
    typeof source.url === 'string'
  );
}

function isQuizQuestion(value: unknown): value is QuizQuestion {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<QuizQuestion>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.question === 'string' &&
    Array.isArray(candidate.options) &&
    candidate.options.every((option) => typeof option === 'string') &&
    typeof candidate.correctIndex === 'number' &&
    (candidate.topic === undefined || typeof candidate.topic === 'string') &&
    (candidate.questionType === undefined ||
      isQuizQuestionType(candidate.questionType)) &&
    (candidate.source === undefined || isQuizSource(candidate.source))
  );
}

function isQuizAttempt(value: unknown): value is QuizAttempt {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<QuizAttempt>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.questionId === 'string' &&
    typeof candidate.answeredAt === 'number' &&
    typeof candidate.question === 'string' &&
    Array.isArray(candidate.options) &&
    candidate.options.every((option) => typeof option === 'string') &&
    typeof candidate.correctIndex === 'number' &&
    typeof candidate.correctOption === 'string' &&
    typeof candidate.selectedIndex === 'number' &&
    typeof candidate.selectedOption === 'string' &&
    typeof candidate.isCorrect === 'boolean' &&
    (candidate.topic === undefined || typeof candidate.topic === 'string') &&
    (candidate.questionType === undefined ||
      isQuizQuestionType(candidate.questionType)) &&
    (candidate.source === undefined || isQuizSource(candidate.source))
  );
}

function buildQuizAttempt(
  question: QuizQuestion,
  selectedIndex: number
): QuizAttempt | null {
  if (!isQuizQuestion(question)) return null;
  if (
    !Number.isInteger(selectedIndex) ||
    selectedIndex < 0 ||
    selectedIndex >= question.options.length ||
    question.correctIndex < 0 ||
    question.correctIndex >= question.options.length
  ) {
    return null;
  }

  const answeredAt = Date.now();
  const selectedOption = question.options[selectedIndex];
  const correctOption = question.options[question.correctIndex];
  const isCorrect = selectedIndex === question.correctIndex;

  return {
    id: `${question.id}-${answeredAt}`,
    questionId: question.id,
    answeredAt,
    question: question.question,
    options: [...question.options],
    correctIndex: question.correctIndex,
    correctOption,
    selectedIndex,
    selectedOption,
    isCorrect,
    mode: question.mode,
    topic: question.topic,
    questionType: question.questionType,
    contextNote: question.contextNote,
    explanation: question.explanation,
    source: question.source
      ? {
          ...question.source,
          tags: [...question.source.tags],
          source: { ...question.source.source },
        }
      : undefined,
  };
}

export async function getStats(): Promise<UserStats> {
  const result = await chrome.storage.local.get('stats');
  return (result.stats as UserStats) ?? DEFAULT_STATS;
}

export async function getQuizAttempts(): Promise<QuizAttempt[]> {
  const result = await chrome.storage.local.get('quizAttempts');
  const attempts = result.quizAttempts;
  if (!Array.isArray(attempts)) return [];

  return attempts.filter(isQuizAttempt);
}

export async function getRecentQuizSourceIds(limit = 5): Promise<string[]> {
  const attempts = await getQuizAttempts();
  const recentSourceIds: string[] = [];
  const seen = new Set<string>();

  for (const attempt of attempts) {
    const sourceId = attempt.source?.id;
    if (!sourceId || seen.has(sourceId)) continue;
    seen.add(sourceId);
    recentSourceIds.push(sourceId);

    if (recentSourceIds.length >= limit) {
      break;
    }
  }

  return recentSourceIds;
}

export async function getWidgetPosition(): Promise<WidgetPosition | null> {
  const result = await chrome.storage.local.get('widgetPosition');
  return isWidgetPosition(result.widgetPosition) ? result.widgetPosition : null;
}

export async function getQuizMode(): Promise<QuizMode> {
  const result = await chrome.storage.local.get('quizMode');
  return isQuizMode(result.quizMode) ? result.quizMode : DEFAULT_QUIZ_MODE;
}

export async function getQuizProvider(): Promise<QuizProvider> {
  const result = await chrome.storage.local.get(QUIZ_PROVIDER_STORAGE_KEY);
  return isQuizProvider(result[QUIZ_PROVIDER_STORAGE_KEY])
    ? result[QUIZ_PROVIDER_STORAGE_KEY]
    : DEFAULT_QUIZ_PROVIDER;
}

export async function getProviderApiKey(): Promise<string> {
  const result = await chrome.storage.local.get([
    PROVIDER_API_KEY_STORAGE_KEY,
    LEGACY_GEMINI_API_KEY_STORAGE_KEY,
  ]);
  return typeof result[PROVIDER_API_KEY_STORAGE_KEY] === 'string'
    ? result[PROVIDER_API_KEY_STORAGE_KEY]
    : typeof result[LEGACY_GEMINI_API_KEY_STORAGE_KEY] === 'string'
      ? result[LEGACY_GEMINI_API_KEY_STORAGE_KEY]
    : '';
}

export async function setWidgetPosition(
  position: WidgetPosition
): Promise<void> {
  await chrome.storage.local.set({ widgetPosition: position });
}

export async function setQuizMode(mode: QuizMode): Promise<void> {
  await chrome.storage.local.set({ quizMode: mode });
}

export async function setQuizProvider(provider: QuizProvider): Promise<void> {
  await chrome.storage.local.set({ [QUIZ_PROVIDER_STORAGE_KEY]: provider });
}

export async function setProviderApiKey(apiKey: string): Promise<void> {
  const normalized = apiKey.trim();
  if (!normalized) {
    await chrome.storage.local.remove([
      PROVIDER_API_KEY_STORAGE_KEY,
      LEGACY_GEMINI_API_KEY_STORAGE_KEY,
    ]);
    return;
  }

  await chrome.storage.local.set({ [PROVIDER_API_KEY_STORAGE_KEY]: normalized });
  await chrome.storage.local.remove(LEGACY_GEMINI_API_KEY_STORAGE_KEY);
}

export async function recordAnswer(
  question: QuizQuestion,
  selectedIndex: number
): Promise<{ stats: UserStats; attempt: QuizAttempt | null }> {
  const attempt = buildQuizAttempt(question, selectedIndex);
  if (!attempt) {
    return { stats: await getStats(), attempt: null };
  }

  const stats = await getStats();
  const attempts = await getQuizAttempts();
  const updated: UserStats = {
    quizzesShown: stats.quizzesShown,
    quizzesAnswered: stats.quizzesAnswered + 1,
    correctAnswers: stats.correctAnswers + (attempt.isCorrect ? 1 : 0),
    streak: attempt.isCorrect ? stats.streak + 1 : 0,
  };
  await chrome.storage.local.set({
    stats: updated,
    quizAttempts: [attempt, ...attempts].slice(0, MAX_QUIZ_ATTEMPTS),
  });
  return { stats: updated, attempt };
}

export async function recordQuizShown(): Promise<void> {
  const stats = await getStats();
  await chrome.storage.local.set({
    stats: { ...stats, quizzesShown: stats.quizzesShown + 1 },
  });
}

export async function getPetState(): Promise<PetState> {
  const result = await chrome.storage.local.get('petState');
  return hydratePetState(result.petState);
}

export async function setPetState(petState: PetState): Promise<void> {
  await chrome.storage.local.set({ petState });
}
