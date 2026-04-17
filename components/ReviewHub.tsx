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

type AttemptSortOrder =
  | 'newest'
  | 'oldest'
  | 'correct-first'
  | 'incorrect-first'
  | 'topic';

const SORT_OPTIONS: Array<{ value: AttemptSortOrder; label: string }> = [
  { value: 'newest', label: 'Newest to oldest' },
  { value: 'oldest', label: 'Oldest to newest' },
  { value: 'correct-first', label: 'Correct to incorrect' },
  { value: 'incorrect-first', label: 'Incorrect to correct' },
  { value: 'topic', label: 'Sorted by topic' },
];

function getAttemptTopic(attempt: QuizAttempt): string {
  if (attempt.source?.subcategory) return attempt.source.subcategory;
  if (attempt.source?.category) return attempt.source.category;
  if (attempt.mode === 'retrieval') return 'Retrieval Review';
  if (attempt.mode === 'math') return 'Math Drill';
  return 'Quiz';
}

function getAttemptModeLabel(mode: QuizMode | undefined): string {
  if (mode === 'retrieval') return 'Retrieval Review';
  if (mode === 'math') return 'Math Drill';
  return 'Quiz';
}

export function ReviewHub() {
  const [quizMode, setQuizModeState] = useState<QuizMode>('retrieval');
  const [expandedMode, setExpandedMode] = useState<QuizMode | null>(null);
  const [stats, setStats] = useState<UserStats>(EMPTY_STATS);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [isSavingMode, setIsSavingMode] = useState(false);
  const [geminiApiKey, setGeminiApiKeyState] = useState('');
  const [geminiApiKeyDraft, setGeminiApiKeyDraft] = useState('');
  const [isSavingGeminiKey, setIsSavingGeminiKey] = useState(false);
  const [isGeminiKeyVisible, setIsGeminiKeyVisible] = useState(false);
  const [isGeminiSectionOpen, setIsGeminiSectionOpen] = useState(true);
  const [attemptSortOrder, setAttemptSortOrder] =
    useState<AttemptSortOrder>('newest');

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
      setIsGeminiSectionOpen(savedGeminiApiKey.trim().length === 0);
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
        setIsGeminiSectionOpen(nextGeminiApiKey.trim().length === 0);
      }

      if (changes.geminiApiKey && changes.geminiApiKey.newValue === undefined) {
        setGeminiApiKeyState('');
        setGeminiApiKeyDraft('');
        setIsGeminiSectionOpen(true);
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const accuracy = useMemo(() => {
    if (stats.quizzesAnswered === 0) return '—';
    return `${Math.round((stats.correctAnswers / stats.quizzesAnswered) * 100)}%`;
  }, [stats.correctAnswers, stats.quizzesAnswered]);

  const hasStoredGeminiApiKey = geminiApiKey.trim().length > 0;
  const geminiKeyHasChanges = geminiApiKeyDraft.trim() !== geminiApiKey.trim();
  const sortedAttempts = useMemo(() => {
    const nextAttempts = [...attempts];

    switch (attemptSortOrder) {
      case 'oldest':
        nextAttempts.sort((left, right) => left.answeredAt - right.answeredAt);
        break;
      case 'correct-first':
        nextAttempts.sort((left, right) => {
          if (left.isCorrect !== right.isCorrect) {
            return Number(right.isCorrect) - Number(left.isCorrect);
          }

          return right.answeredAt - left.answeredAt;
        });
        break;
      case 'incorrect-first':
        nextAttempts.sort((left, right) => {
          if (left.isCorrect !== right.isCorrect) {
            return Number(left.isCorrect) - Number(right.isCorrect);
          }

          return right.answeredAt - left.answeredAt;
        });
        break;
      case 'topic':
        nextAttempts.sort((left, right) => {
          const topicComparison = getAttemptTopic(left).localeCompare(
            getAttemptTopic(right)
          );

          if (topicComparison !== 0) {
            return topicComparison;
          }

          return right.answeredAt - left.answeredAt;
        });
        break;
      case 'newest':
      default:
        nextAttempts.sort((left, right) => right.answeredAt - left.answeredAt);
        break;
    }

    return nextAttempts;
  }, [attemptSortOrder, attempts]);

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

  function handleModeDescriptionToggle(mode: QuizMode) {
    setExpandedMode((current) => (current === mode ? null : mode));
  }

  async function handleGeminiApiKeySave() {
    setIsSavingGeminiKey(true);
    try {
      const normalized = geminiApiKeyDraft.trim();
      await setGeminiApiKey(normalized);
      setGeminiApiKeyState(normalized);
      setGeminiApiKeyDraft(normalized);
      setIsGeminiSectionOpen(normalized.length === 0);
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
      setIsGeminiSectionOpen(true);
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
            <h2 className="text-sm font-semibold text-slate-900">
              Change Quiz Mode
            </h2>
          </div>

          <div
            role="radiogroup"
            aria-label="Quiz mode"
            className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
          >
            {(['retrieval', 'math'] as QuizMode[]).map((mode) => {
              const active = mode === quizMode;
              const expanded = mode === expandedMode;
              return (
                <div
                  key={mode}
                  className={
                    mode === 'math' ? 'border-t border-slate-200' : undefined
                  }
                >
                  <div
                    className={`flex items-center gap-3 px-4 py-4 transition ${
                      active ? 'bg-teal-50' : 'bg-slate-50'
                    }`}
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => void handleModeChange(mode)}
                      disabled={isSavingMode && active}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <div
                        className={`h-4 w-4 shrink-0 rounded-full border ${
                          active
                            ? 'border-teal-600 bg-teal-600 shadow-[0_0_0_3px_rgba(20,184,166,0.18)]'
                            : 'border-slate-300 bg-white'
                        }`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">
                          {MODE_COPY[mode].label}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={`quiz-mode-description-${mode}`}
                      aria-label={`${
                        expanded ? 'Hide' : 'Show'
                      } ${MODE_COPY[mode].label} description`}
                      onClick={() => handleModeDescriptionToggle(mode)}
                      className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                    >
                      <svg
                        viewBox="0 0 20 20"
                        fill="none"
                        aria-hidden="true"
                        className={`h-4 w-4 transition-transform ${
                          expanded ? 'rotate-180' : ''
                        }`}
                      >
                        <path
                          d="M5 7.5L10 12.5L15 7.5"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>

                  {expanded && (
                    <div
                      id={`quiz-mode-description-${mode}`}
                      className="border-t border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600"
                    >
                      {MODE_COPY[mode].description}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-5 border-t border-slate-200 pt-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Gemini API Key
              </h2>
              {(!hasStoredGeminiApiKey || isGeminiSectionOpen) && (
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Enter your own Gemini API key here. WaitWise stores it only in this
                  browser&apos;s extension storage so you can edit it later in the
                  review hub.
                </p>
              )}
            </div>
            <button
              type="button"
              aria-expanded={isGeminiSectionOpen}
              aria-controls="gemini-api-key-panel"
              aria-label={`${
                isGeminiSectionOpen ? 'Hide' : 'Show'
              } Gemini API key settings`}
              onClick={() => setIsGeminiSectionOpen((current) => !current)}
              className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
            >
              <svg
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
                className={`h-4 w-4 transition-transform ${
                  isGeminiSectionOpen ? 'rotate-180' : ''
                }`}
              >
                <path
                  d="M5 7.5L10 12.5L15 7.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          {isGeminiSectionOpen && (
            <div
              id="gemini-api-key-panel"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
            >
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
          )}
        </section>

        <section className="mt-5 border-t border-slate-200 pt-5">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Recent Review
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Your latest answered quizzes live here so we can turn this popup
                into a real review hub instead of just a stats board.
              </p>
            </div>
            <label className="min-w-0">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Sort
              </span>
              <select
                value={attemptSortOrder}
                onChange={(event) =>
                  setAttemptSortOrder(event.target.value as AttemptSortOrder)
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {sortedAttempts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
              No answered quizzes yet. Answer one in ChatGPT and it will show up
              here.
            </div>
          ) : (
            <div className="space-y-3">
              {sortedAttempts.map((attempt) => (
                <details
                  key={attempt.id}
                  className={`group rounded-2xl border px-4 py-4 ${
                    attempt.isCorrect
                      ? 'border-emerald-200 bg-emerald-50/70'
                      : 'border-rose-200 bg-rose-50/70'
                  }`}
                >
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-6 text-slate-900">
                        {attempt.question}
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition group-open:rotate-180">
                      <svg
                        viewBox="0 0 20 20"
                        fill="none"
                        aria-hidden="true"
                        className="h-4 w-4"
                      >
                        <path
                          d="M5 7.5L10 12.5L15 7.5"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </summary>

                  <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
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
                          {getAttemptModeLabel(attempt.mode)}
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                          {getAttemptTopic(attempt)}
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

                    <div className="space-y-2 text-sm leading-6 text-slate-600">
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
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
