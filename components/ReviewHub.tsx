import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  getProviderApiKey,
  getQuizAttempts,
  getQuizMode,
  getQuizProvider,
  getStats,
  getPetState,
  setProviderApiKey,
  setQuizMode,
  setQuizProvider,
} from '../lib/storage';
import type {
  QuizAttempt,
  QuizMode,
  QuizProvider,
  QuizQuestionType,
  UserStats,
} from '../types/messages';
import type { PetState } from '../types/pet';
import { hydratePetState } from '../lib/petEngine';
import { PetDisplay } from './PetDisplay';

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
      'Use WaitWise retrieval plus your active provider to surface a grounded review question. If nothing relevant is found, show a fallback review question from the RAG database instead.',
  },
  general: {
    label: 'General Thinking',
    description:
      'Use your current prompt to generate one broader thinking-extension quiz. This mode stays close to your topic, but it can zoom out into adjacent ideas when that helps the question feel thoughtful.',
  },
  math: {
    label: 'Math Drill',
    description:
      'Show quick arithmetic practice while ChatGPT is generating. If your active provider is configured, WaitWise will try provider-backed math first and fall back to a local drill when needed.',
  },
};

const PROVIDER_COPY: Record<
  QuizProvider,
  {
    label: string;
    shortLabel: string;
    placeholder: string;
    description: string;
    helper: string;
  }
> = {
  gemini: {
    label: 'Google Gemini',
    shortLabel: 'Gemini',
    placeholder: 'Paste your Gemini API key',
    description:
      'Use Gemini as the active quiz engine for Retrieval Review, General Thinking, and Math Drill.',
    helper:
      'This key stays on your machine. WaitWise stores only one active provider key at a time.',
  },
  openai: {
    label: 'OpenAI',
    shortLabel: 'OpenAI',
    placeholder: 'Paste your OpenAI API key',
    description:
      'Use OpenAI as the active quiz engine for Retrieval Review, General Thinking, and Math Drill.',
    helper:
      'Switching providers keeps one local key slot, so replacing this key will overwrite the current active provider key.',
  },
  anthropic: {
    label: 'Anthropic',
    shortLabel: 'Anthropic',
    placeholder: 'Paste your Anthropic API key',
    description:
      'Use Anthropic as the active quiz engine for Retrieval Review, General Thinking, and Math Drill.',
    helper:
      'WaitWise keeps this key in local extension storage only. There is no shared backend secret in this flow.',
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

const MODE_SECTION_ORDER: QuizMode[] = ['retrieval', 'general', 'math'];

function getAttemptTopic(attempt: QuizAttempt): string {
  if (attempt.topic) return attempt.topic;
  if (attempt.source?.subcategory) return attempt.source.subcategory;
  if (attempt.source?.category) return attempt.source.category;
  if (attempt.mode === 'retrieval') return 'Retrieval Review';
  if (attempt.mode === 'general') return 'General Thinking';
  if (attempt.mode === 'math') return 'Math Drill';
  return 'Quiz';
}

function getAttemptModeLabel(mode: QuizMode | undefined): string {
  if (mode === 'retrieval') return 'Retrieval Review';
  if (mode === 'general') return 'General Thinking';
  if (mode === 'math') return 'Math Drill';
  return 'Quiz';
}

function formatQuestionType(
  questionType: QuizQuestionType | undefined
): string | null {
  if (!questionType) return null;

  return questionType
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function sortAttempts(
  attempts: QuizAttempt[],
  sortOrder: AttemptSortOrder
): QuizAttempt[] {
  const nextAttempts = [...attempts];

  switch (sortOrder) {
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
}

export function ReviewHub() {
  const [quizMode, setQuizModeState] = useState<QuizMode>('retrieval');
  const [expandedMode, setExpandedMode] = useState<QuizMode | null>(null);
  const [stats, setStats] = useState<UserStats>(EMPTY_STATS);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [isSavingMode, setIsSavingMode] = useState(false);
  const [quizProvider, setQuizProviderState] = useState<QuizProvider>('gemini');
  const [quizProviderDraft, setQuizProviderDraft] = useState<QuizProvider>('gemini');
  const [providerApiKey, setProviderApiKeyState] = useState('');
  const [providerApiKeyDraft, setProviderApiKeyDraft] = useState('');
  const [isSavingProviderSettings, setIsSavingProviderSettings] = useState(false);
  const [isProviderKeyVisible, setIsProviderKeyVisible] = useState(false);
  const [isProviderSectionOpen, setIsProviderSectionOpen] = useState(true);
  const [attemptSortOrder, setAttemptSortOrder] =
    useState<AttemptSortOrder>('newest');
  const [petState, setPetState] = useState<PetState | null>(null);
  const petAnimKeyRef = useRef(0);
  const [petAnimKey, setPetAnimKey] = useState(0);

  useEffect(() => {
    async function loadState() {
      const [
        savedMode,
        savedStats,
        savedAttempts,
        savedQuizProvider,
        savedProviderApiKey,
        savedPetState,
      ] = await Promise.all([
        getQuizMode(),
        getStats(),
        getQuizAttempts(),
        getQuizProvider(),
        getProviderApiKey(),
        getPetState(),
      ]);

      setQuizModeState(savedMode);
      setStats(savedStats);
      setAttempts(savedAttempts);
      setQuizProviderState(savedQuizProvider);
      setQuizProviderDraft(savedQuizProvider);
      setProviderApiKeyState(savedProviderApiKey);
      setProviderApiKeyDraft(savedProviderApiKey);
      setIsProviderSectionOpen(savedProviderApiKey.trim().length === 0);
      setPetState(savedPetState);
    }

    void loadState();

    function handleStorageChange(
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) {
      if (areaName !== 'local') return;

      const nextQuizMode = changes.quizMode?.newValue;
      if (
        nextQuizMode === 'retrieval' ||
        nextQuizMode === 'general' ||
        nextQuizMode === 'math'
      ) {
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

      const nextQuizProvider = changes.quizProvider?.newValue;
      if (
        nextQuizProvider === 'gemini' ||
        nextQuizProvider === 'openai' ||
        nextQuizProvider === 'anthropic'
      ) {
        setQuizProviderState(nextQuizProvider);
        setQuizProviderDraft(nextQuizProvider);
      }

      const nextProviderApiKey = changes.providerApiKey?.newValue;
      if (typeof nextProviderApiKey === 'string') {
        setProviderApiKeyState(nextProviderApiKey);
        setProviderApiKeyDraft(nextProviderApiKey);
        setIsProviderSectionOpen(nextProviderApiKey.trim().length === 0);
      }

      if (changes.providerApiKey && changes.providerApiKey.newValue === undefined) {
        setProviderApiKeyState('');
        setProviderApiKeyDraft('');
        setIsProviderSectionOpen(true);
      }

      if (changes.petState) {
        const nextPet = hydratePetState(changes.petState.newValue);
        setPetState(nextPet);
        petAnimKeyRef.current += 1;
        setPetAnimKey(petAnimKeyRef.current);
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const accuracy = useMemo(() => {
    if (stats.quizzesAnswered === 0) return '—';
    return `${Math.round((stats.correctAnswers / stats.quizzesAnswered) * 100)}%`;
  }, [stats.correctAnswers, stats.quizzesAnswered]);

  const hasStoredProviderApiKey = providerApiKey.trim().length > 0;
  const providerSettingsHaveChanges =
    quizProviderDraft !== quizProvider ||
    providerApiKeyDraft.trim() !== providerApiKey.trim();
  const activeProviderCopy = PROVIDER_COPY[quizProviderDraft];

  const groupedAttempts = useMemo(() => {
    const attemptsByMode = new Map<QuizMode | 'other', QuizAttempt[]>();

    attempts.forEach((attempt) => {
      const mode =
        attempt.mode === 'retrieval' ||
        attempt.mode === 'general' ||
        attempt.mode === 'math'
          ? attempt.mode
          : 'other';
      const existing = attemptsByMode.get(mode) ?? [];
      existing.push(attempt);
      attemptsByMode.set(mode, existing);
    });

    const orderedGroups = MODE_SECTION_ORDER.map((mode) => ({
      mode,
      label: MODE_COPY[mode].label,
      attempts: sortAttempts(attemptsByMode.get(mode) ?? [], attemptSortOrder),
    })).filter((group) => group.attempts.length > 0);

    const otherAttempts = attemptsByMode.get('other') ?? [];
    if (otherAttempts.length > 0) {
      orderedGroups.push({
        mode: 'other',
        label: 'Other Quizzes',
        attempts: sortAttempts(otherAttempts, attemptSortOrder),
      });
    }

    return orderedGroups;
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

  async function handleProviderSettingsSave() {
    setIsSavingProviderSettings(true);
    try {
      const normalizedApiKey = providerApiKeyDraft.trim();
      await Promise.all([
        setQuizProvider(quizProviderDraft),
        setProviderApiKey(normalizedApiKey),
      ]);
      setQuizProviderState(quizProviderDraft);
      setProviderApiKeyState(normalizedApiKey);
      setProviderApiKeyDraft(normalizedApiKey);
      setIsProviderSectionOpen(normalizedApiKey.length === 0);
    } finally {
      setIsSavingProviderSettings(false);
    }
  }

  async function handleProviderApiKeyClear() {
    setIsSavingProviderSettings(true);
    try {
      await setProviderApiKey('');
      setProviderApiKeyState('');
      setProviderApiKeyDraft('');
      setIsProviderSectionOpen(true);
    } finally {
      setIsSavingProviderSettings(false);
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

        {petState && (
          <section className="mb-5 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
            <PetDisplay
              petState={petState}
              animationType="idle"
              animKey={petAnimKey}
            />
          </section>
        )}

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
            {(['retrieval', 'general', 'math'] as QuizMode[]).map((mode, index) => {
              const active = mode === quizMode;
              const expanded = mode === expandedMode;
              return (
                <div
                  key={mode}
                  className={index > 0 ? 'border-t border-slate-200' : undefined}
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
                Quiz API Provider
              </h2>
              {(!hasStoredProviderApiKey || isProviderSectionOpen) && (
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Choose one API-backed provider for quiz generation and save one
                  local key for it.
                </p>
              )}
            </div>
            <button
              type="button"
              aria-expanded={isProviderSectionOpen}
              aria-controls="provider-settings-panel"
              aria-label={`${
                isProviderSectionOpen ? 'Hide' : 'Show'
              } provider settings`}
              onClick={() => setIsProviderSectionOpen((current) => !current)}
              className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
            >
              <svg
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
                className={`h-4 w-4 transition-transform ${
                  isProviderSectionOpen ? 'rotate-180' : ''
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

          {isProviderSectionOpen && (
            <div
              id="provider-settings-panel"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Local-only setting
                </div>
                <div
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    hasStoredProviderApiKey
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {hasStoredProviderApiKey ? 'Saved locally' : 'Not set'}
                </div>
              </div>

              <label className="block text-sm font-medium text-slate-900">
                Provider
              </label>
              <select
                value={quizProviderDraft}
                onChange={(event) =>
                  setQuizProviderDraft(event.target.value as QuizProvider)
                }
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              >
                {(['gemini', 'openai', 'anthropic'] as QuizProvider[]).map((provider) => (
                  <option key={provider} value={provider}>
                    {PROVIDER_COPY[provider].label}
                  </option>
                ))}
              </select>

              <p className="mt-3 text-sm leading-6 text-slate-600">
                {activeProviderCopy.description}
              </p>

              <label className="mt-4 block text-sm font-medium text-slate-900">
                API key
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  type={isProviderKeyVisible ? 'text' : 'password'}
                  value={providerApiKeyDraft}
                  onChange={(event) => setProviderApiKeyDraft(event.target.value)}
                  placeholder={activeProviderCopy.placeholder}
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
                <button
                  type="button"
                  onClick={() => setIsProviderKeyVisible((current) => !current)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                >
                  {isProviderKeyVisible ? 'Hide' : 'Show'}
                </button>
              </div>

              <p className="mt-3 text-xs leading-5 text-slate-500">
                {activeProviderCopy.helper}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleProviderSettingsSave()}
                  disabled={isSavingProviderSettings || !providerSettingsHaveChanges}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    isSavingProviderSettings || !providerSettingsHaveChanges
                      ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                      : 'bg-teal-600 text-white hover:bg-teal-700'
                  }`}
                >
                  {isSavingProviderSettings ? 'Saving...' : 'Save provider'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleProviderApiKeyClear()}
                  disabled={isSavingProviderSettings && !hasStoredProviderApiKey}
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

          {groupedAttempts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
              No answered quizzes yet. Answer one in ChatGPT and it will show up
              here.
            </div>
          ) : (
            <div className="space-y-3">
              {groupedAttempts.map((group) => (
                <section
                  key={group.mode}
                  className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3"
                >
                  <div className="mb-3 flex items-center justify-between gap-3 px-1">
                    <h3 className="text-sm font-semibold text-slate-900">
                      {group.label}
                    </h3>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                      {group.attempts.length}{' '}
                      {group.attempts.length === 1 ? 'question' : 'questions'}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {group.attempts.map((attempt) => (
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
                                {getAttemptTopic(attempt)}
                              </span>
                              {formatQuestionType(attempt.questionType) && (
                                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                                  {formatQuestionType(attempt.questionType)}
                                </span>
                              )}
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
                </section>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
