import React, { useEffect, useMemo, useState } from 'react';
import {
  getGeminiApiKey,
  getQuizAttempts,
  getQuizMode,
  getStats,
  setGeminiApiKey,
  setQuizMode,
} from '../lib/storage';
import type { QuizAttempt, QuizMode, UserStats } from '../types/messages';

const EMPTY_STATS: UserStats = {
  quizzesShown: 0,
  quizzesAnswered: 0,
  correctAnswers: 0,
  streak: 0,
};

const MODE_COPY: Record<
  QuizMode,
  { label: string; description: string }
> = {
  retrieval: {
    label: 'Retrieval Review',
    description:
      'Use the current prompt plus recent assistant replies to surface a relevant review question. If nothing relevant is found, show a random review question from the RAG database instead.',
  },
  math: {
    label: 'Math Drill',
    description:
      'Show quick arithmetic practice while ChatGPT is generating. Best when you want a clean, topic-agnostic wait-state quiz.',
  },
};

export function ReviewHub() {
  const [quizMode, setQuizModeState] = useState<QuizMode>('retrieval');
  const [stats, setStats] = useState<UserStats>(EMPTY_STATS);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [isSavingMode, setIsSavingMode] = useState(false);
  const [geminiApiKey, setGeminiApiKeyState] = useState('');
  const [geminiApiKeyDraft, setGeminiApiKeyDraft] = useState('');
  const [isSavingGeminiKey, setIsSavingGeminiKey] = useState(false);
  const [isGeminiKeyVisible, setIsGeminiKeyVisible] = useState(false);

  useEffect(() => {
    async function loadState() {
      const [savedMode, savedStats, savedAttempts, savedGeminiApiKey] = await Promise.all([
        getQuizMode(),
        getStats(),
        getQuizAttempts(),
        getGeminiApiKey(),
      ]);

      setQuizModeState(savedMode);
      setStats(savedStats);
      setAttempts(savedAttempts);
      setGeminiApiKeyState(savedGeminiApiKey);
      setGeminiApiKeyDraft(savedGeminiApiKey);
    }

    void loadState();

    function handleStorageChange(
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) {
      if (areaName !== 'local') return;

      const nextQuizMode = changes.quizMode?.newValue;
      if (nextQuizMode === 'retrieval' || nextQuizMode === 'math') {
        setQuizModeState(nextQuizMode);
      }

      const nextStats = changes.stats?.newValue as UserStats | undefined;
      if (nextStats) {
        setStats(nextStats);
      }

      const nextAttempts = changes.quizAttempts?.newValue;
      if (Array.isArray(nextAttempts)) {
        setAttempts(nextAttempts as QuizAttempt[]);
      }

      const nextGeminiApiKey = changes.geminiApiKey?.newValue;
      if (typeof nextGeminiApiKey === 'string') {
        setGeminiApiKeyState(nextGeminiApiKey);
        setGeminiApiKeyDraft(nextGeminiApiKey);
      }

      if (changes.geminiApiKey && changes.geminiApiKey.newValue === undefined) {
        setGeminiApiKeyState('');
        setGeminiApiKeyDraft('');
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const accuracy = useMemo(() => {
    if (stats.quizzesAnswered === 0) return '—';
    return `${Math.round((stats.correctAnswers / stats.quizzesAnswered) * 100)}%`;
  }, [stats.correctAnswers, stats.quizzesAnswered]);

  const recentAttempts = attempts.slice(0, 5);
  const hasStoredGeminiApiKey = geminiApiKey.trim().length > 0;
  const geminiKeyHasChanges = geminiApiKeyDraft.trim() !== geminiApiKey.trim();

  async function handleModeChange(nextMode: QuizMode) {
    if (nextMode === quizMode) return;

    setQuizModeState(nextMode);
    setIsSavingMode(true);
    try {
      await setQuizMode(nextMode);
    } finally {
      setIsSavingMode(false);
    }
  }

  async function handleGeminiApiKeySave() {
    setIsSavingGeminiKey(true);
    try {
      const normalized = geminiApiKeyDraft.trim();
      await setGeminiApiKey(normalized);
      setGeminiApiKeyState(normalized);
      setGeminiApiKeyDraft(normalized);
    } finally {
      setIsSavingGeminiKey(false);
    }
  }

  async function handleGeminiApiKeyClear() {
    setIsSavingGeminiKey(true);
    try {
      await setGeminiApiKey('');
      setGeminiApiKeyState('');
      setGeminiApiKeyDraft('');
    } finally {
      setIsSavingGeminiKey(false);
    }
  }

  return (
    <main className="min-w-[24rem] bg-[linear-gradient(180deg,#fffdf6_0%,#f6f7fb_100%)] p-4 text-slate-900">
      <section className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_50px_-28px_rgba(15,23,42,0.45)]">
        <div className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-teal-700">
            wAItwise
          </p>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div>
              <h1 className="font-serif text-2xl text-slate-950">
                Review Hub
              </h1>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
                Choose what kind of quiz shows up while ChatGPT is working, then
                keep an eye on how much review you are stacking up.
              </p>
            </div>
            <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
              {MODE_COPY[quizMode].label}
            </div>
          </div>
        </div>

        <section className="mb-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-slate-950 px-4 py-3 text-slate-50">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-300">
              Shown
            </div>
            <div className="mt-2 text-2xl font-semibold">{stats.quizzesShown}</div>
          </div>
          <div className="rounded-2xl bg-teal-50 px-4 py-3 text-teal-950">
            <div className="text-[11px] uppercase tracking-[0.2em] text-teal-700">
              Answered
            </div>
            <div className="mt-2 text-2xl font-semibold">{stats.quizzesAnswered}</div>
          </div>
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-amber-950">
            <div className="text-[11px] uppercase tracking-[0.2em] text-amber-700">
              Accuracy
            </div>
            <div className="mt-2 text-2xl font-semibold">{accuracy}</div>
          </div>
          <div className="rounded-2xl bg-rose-50 px-4 py-3 text-rose-950">
            <div className="text-[11px] uppercase tracking-[0.2em] text-rose-700">
              Streak
            </div>
            <div className="mt-2 text-2xl font-semibold">{stats.streak}</div>
          </div>
        </section>

        <section>
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-slate-900">Quiz Mode</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Switch between topic-aware review and pure math practice without
              reopening the ChatGPT tab.
            </p>
          </div>

          <div className="space-y-3">
            {(['retrieval', 'math'] as QuizMode[]).map((mode) => {
              const active = mode === quizMode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => void handleModeChange(mode)}
                  disabled={isSavingMode && active}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                    active
                      ? 'border-teal-500 bg-teal-50 shadow-[0_12px_30px_-24px_rgba(13,148,136,0.85)]'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {MODE_COPY[mode].label}
                      </div>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {MODE_COPY[mode].description}
                      </p>
                    </div>
                    <div
                      className={`mt-1 h-4 w-4 rounded-full border ${
                        active
                          ? 'border-teal-600 bg-teal-600 shadow-[0_0_0_3px_rgba(20,184,166,0.18)]'
                          : 'border-slate-300 bg-white'
                      }`}
                      aria-hidden="true"
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-5 border-t border-slate-200 pt-5">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Gemini API Key
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Enter your own Gemini API key here. WaitWise stores it only in this
              browser&apos;s extension storage so you can edit it later in the
              review hub.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Local-only setting
              </div>
              <div
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  hasStoredGeminiApiKey
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {hasStoredGeminiApiKey ? 'Saved locally' : 'Not set'}
              </div>
            </div>

            <label className="block text-sm font-medium text-slate-900">
              API key
            </label>
            <div className="mt-2 flex gap-2">
              <input
                type={isGeminiKeyVisible ? 'text' : 'password'}
                value={geminiApiKeyDraft}
                onChange={(event) => setGeminiApiKeyDraft(event.target.value)}
                placeholder="Paste your Gemini API key"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
              <button
                type="button"
                onClick={() => setIsGeminiKeyVisible((current) => !current)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              >
                {isGeminiKeyVisible ? 'Hide' : 'Show'}
              </button>
            </div>

            <p className="mt-3 text-xs leading-5 text-slate-500">
              This key stays on your machine. WaitWise does not need a shared
              backend key for this flow.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleGeminiApiKeySave()}
                disabled={isSavingGeminiKey || !geminiKeyHasChanges}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  isSavingGeminiKey || !geminiKeyHasChanges
                    ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                    : 'bg-teal-600 text-white hover:bg-teal-700'
                }`}
              >
                {isSavingGeminiKey ? 'Saving...' : 'Save key'}
              </button>
              <button
                type="button"
                onClick={() => void handleGeminiApiKeyClear()}
                disabled={isSavingGeminiKey && !hasStoredGeminiApiKey}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              >
                Remove key
              </button>
            </div>
          </div>
        </section>

        <section className="mt-5 border-t border-slate-200 pt-5">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Recent Review
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Your latest answered quizzes live here so we can turn this popup
              into a real review hub instead of just a stats board.
            </p>
          </div>

          {recentAttempts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
              No answered quizzes yet. Answer one in ChatGPT and it will show up
              here.
            </div>
          ) : (
            <div className="space-y-3">
              {recentAttempts.map((attempt) => (
                <article
                  key={attempt.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                          attempt.isCorrect
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {attempt.isCorrect ? 'Correct' : 'Missed'}
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                        {attempt.mode ?? 'quiz'}
                      </span>
                    </div>
                    <time className="text-xs text-slate-400">
                      {new Date(attempt.answeredAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>

                  <p className="mt-3 text-sm font-semibold leading-6 text-slate-900">
                    {attempt.question}
                  </p>

                  <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                    <p>
                      <span className="font-medium text-slate-900">
                        Your answer:
                      </span>{' '}
                      {attempt.selectedOption}
                    </p>
                    {!attempt.isCorrect && (
                      <p>
                        <span className="font-medium text-slate-900">
                          Correct answer:
                        </span>{' '}
                        {attempt.correctOption}
                      </p>
                    )}
                    {attempt.explanation && (
                      <p className="text-slate-500">{attempt.explanation}</p>
                    )}
                    {attempt.source && (
                      <details className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">
                          Source evidence
                        </summary>
                        <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                          <p className="font-medium text-slate-900">
                            {attempt.source.title}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                              {attempt.source.category}
                            </span>
                            {attempt.source.subcategory && (
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                                {attempt.source.subcategory}
                              </span>
                            )}
                            {attempt.source.tags.slice(0, 4).map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                          <p>{attempt.source.answer}</p>
                          <a
                            href={attempt.source.source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center text-sm font-medium text-teal-700 hover:text-teal-900"
                          >
                            Open source entry
                          </a>
                        </div>
                      </details>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
