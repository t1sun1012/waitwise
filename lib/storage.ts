import type {
  QuizAttempt,
  QuizMode,
  QuizQuestion,
  QuizSource,
  UserStats,
} from '../types/messages';

const DEFAULT_STATS: UserStats = {
  quizzesShown: 0,
  quizzesAnswered: 0,
  correctAnswers: 0,
  streak: 0,
};
const DEFAULT_QUIZ_MODE: QuizMode = 'retrieval';
const MAX_QUIZ_ATTEMPTS = 100;
const GEMINI_API_KEY_STORAGE_KEY = 'geminiApiKey';

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
  return value === 'retrieval' || value === 'math';
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

export async function getGeminiApiKey(): Promise<string> {
  const result = await chrome.storage.local.get(GEMINI_API_KEY_STORAGE_KEY);
  return typeof result[GEMINI_API_KEY_STORAGE_KEY] === 'string'
    ? result[GEMINI_API_KEY_STORAGE_KEY]
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

export async function setGeminiApiKey(apiKey: string): Promise<void> {
  const normalized = apiKey.trim();
  if (!normalized) {
    await chrome.storage.local.remove(GEMINI_API_KEY_STORAGE_KEY);
    return;
  }

  await chrome.storage.local.set({ [GEMINI_API_KEY_STORAGE_KEY]: normalized });
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
