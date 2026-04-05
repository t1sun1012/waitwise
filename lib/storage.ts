import type { UserStats } from '../types/messages';

const DEFAULT_STATS: UserStats = {
  quizzesShown: 0,
  quizzesAnswered: 0,
  correctAnswers: 0,
  streak: 0,
};

export async function getStats(): Promise<UserStats> {
  const result = await chrome.storage.local.get('stats');
  return (result.stats as UserStats) ?? DEFAULT_STATS;
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
