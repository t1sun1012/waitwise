import type { UserStats } from '../types/messages';

const DEFAULT_STATS: UserStats = {
  quizzesShown: 0,
  quizzesAnswered: 0,
  correctAnswers: 0,
  streak: 0,
};

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

export async function getStats(): Promise<UserStats> {
  const result = await chrome.storage.local.get('stats');
  return (result.stats as UserStats) ?? DEFAULT_STATS;
}

export async function getWidgetPosition(): Promise<WidgetPosition | null> {
  const result = await chrome.storage.local.get('widgetPosition');
  return isWidgetPosition(result.widgetPosition) ? result.widgetPosition : null;
}

export async function setWidgetPosition(
  position: WidgetPosition
): Promise<void> {
  await chrome.storage.local.set({ widgetPosition: position });
}

export async function recordAnswer(correct: boolean): Promise<UserStats> {
  const stats = await getStats();
  const updated: UserStats = {
    quizzesShown: stats.quizzesShown,
    quizzesAnswered: stats.quizzesAnswered + 1,
    correctAnswers: stats.correctAnswers + (correct ? 1 : 0),
    streak: correct ? stats.streak + 1 : 0,
  };
  await chrome.storage.local.set({ stats: updated });
  return updated;
}

export async function recordQuizShown(): Promise<void> {
  const stats = await getStats();
  await chrome.storage.local.set({
    stats: { ...stats, quizzesShown: stats.quizzesShown + 1 },
  });
}
