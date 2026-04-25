import { getRagCorpus } from '../lib/rag/corpus';
import type { QuizQuestion, QuizSource } from '../types/messages';
import type { RankedRetrievedChunk, RetrievedChunk } from '../types/rag';

const DISTRACTOR_COUNT = 3;
const MAX_OPTION_CHARS = 140;
const MIN_PRIMARY_SCORE = 12;
const MIN_SCORE_GAP = 5;
const RETRIEVED_DISTRACTOR_BONUS = 6;
const SHARED_TAG_WEIGHT = 2;
const ANSWER_OVERLAP_PENALTY = 2;
const RANDOM_FALLBACK_NOTE =
  'No appropriate related question found. Here is a random review question from the RAG database.';

interface GenerateRetrievalQuizOptions {
  recentSourceIds?: string[];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clampText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;

  const sliced = value.slice(0, maxChars).trimEnd();
  const lastSpace = sliced.lastIndexOf(' ');
  if (lastSpace <= Math.floor(maxChars * 0.6)) {
    return `${sliced}...`;
  }

  return `${sliced.slice(0, lastSpace)}...`;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueTokens(value: string): string[] {
  const normalized = normalizeText(value);
  if (!normalized) return [];

  return [...new Set(normalized.split(' ').filter(Boolean))];
}

function summarizeAnswer(answer: string): string {
  const normalized = answer.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  const firstSentenceMatch = normalized.match(/^.+?[.!?](?:\s|$)/);
  const summary = firstSentenceMatch?.[0]?.trim() ?? normalized;
  return clampText(summary, MAX_OPTION_CHARS);
}

function shuffle<T>(values: T[]): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function answerOverlap(primary: RetrievedChunk, candidate: RetrievedChunk): number {
  const primaryTokens = new Set(uniqueTokens(summarizeAnswer(primary.answer)));
  return uniqueTokens(summarizeAnswer(candidate.answer)).filter((token) =>
    primaryTokens.has(token)
  ).length;
}

function scoreDistractor(
  primary: RetrievedChunk,
  candidate: RetrievedChunk,
  retrievalRank = -1
): number {
  let score = 0;

  if (candidate.category === primary.category) score += 4;
  if (candidate.subcategory && candidate.subcategory === primary.subcategory) {
    score += 2;
  }

  const primaryTags = new Set(primary.tags);
  for (const tag of candidate.tags) {
    if (primaryTags.has(tag)) score += SHARED_TAG_WEIGHT;
  }

  if (retrievalRank >= 0) {
    score += Math.max(RETRIEVED_DISTRACTOR_BONUS - retrievalRank, 1);
  }

  return score - answerOverlap(primary, candidate) * ANSWER_OVERLAP_PENALTY;
}

function buildDistractorPool(
  primary: RetrievedChunk,
  retrievedChunks: RankedRetrievedChunk[]
): Array<{ candidate: RetrievedChunk; retrievalRank: number }> {
  const seenIds = new Set([primary.id]);
  const pool: Array<{ candidate: RetrievedChunk; retrievalRank: number }> = [];

  retrievedChunks.slice(1).forEach((result, index) => {
    if (seenIds.has(result.chunk.id)) return;
    seenIds.add(result.chunk.id);
    pool.push({ candidate: result.chunk, retrievalRank: index });
  });

  getRagCorpus().forEach((candidate) => {
    if (seenIds.has(candidate.id)) return;
    seenIds.add(candidate.id);
    pool.push({ candidate, retrievalRank: -1 });
  });

  return pool;
}

function pickDistractorOptions(
  primary: RetrievedChunk,
  retrievedChunks: RankedRetrievedChunk[]
): string[] {
  const correctOption = summarizeAnswer(primary.answer);
  const seen = new Set([correctOption]);

  return buildDistractorPool(primary, retrievedChunks)
    .sort((left, right) => {
      const scoreDelta =
        scoreDistractor(primary, right.candidate, right.retrievalRank) -
        scoreDistractor(primary, left.candidate, left.retrievalRank);
      if (scoreDelta !== 0) return scoreDelta;
      return left.candidate.id.localeCompare(right.candidate.id);
    })
    .map(({ candidate }) => summarizeAnswer(candidate.answer))
    .filter((option) => {
      if (!option || seen.has(option)) return false;
      seen.add(option);
      return true;
    })
    .slice(0, DISTRACTOR_COUNT);
}

export function hasConfidentRetrievalMatch(
  retrievedChunks: RankedRetrievedChunk[]
): boolean {
  if (retrievedChunks.length === 0) return false;

  const [primary, secondary] = retrievedChunks;
  if (primary.score < MIN_PRIMARY_SCORE) return false;
  if (!secondary) return true;

  return primary.score - secondary.score >= MIN_SCORE_GAP;
}

function normalizeQuestion(question: string, title: string): string {
  const normalized = question.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return `Which answer best explains "${title}"?`;
  }

  return normalized;
}

function buildQuizSource(chunk: RetrievedChunk): QuizSource {
  return {
    id: chunk.id,
    corpus: chunk.corpus,
    category: chunk.category,
    subcategory: chunk.subcategory,
    chunkType: chunk.chunkType,
    createdAt: chunk.createdAt,
    title: chunk.title,
    question: chunk.question,
    answer: chunk.answer,
    tags: [...chunk.tags],
    source: { ...chunk.source },
  };
}

function buildQuestion(
  primary: RetrievedChunk,
  retrievedChunks: RankedRetrievedChunk[],
  contextNote?: string
): QuizQuestion | null {
  const correctOption = summarizeAnswer(primary.answer);
  const distractors = pickDistractorOptions(primary, retrievedChunks);
  if (!correctOption || distractors.length < DISTRACTOR_COUNT) {
    return null;
  }

  const options = shuffle([correctOption, ...distractors]);
  return {
    id: `retrieval-${primary.id}-${Date.now()}-${randomInt(0, 9999)}`,
    question: normalizeQuestion(primary.question, primary.title),
    options,
    correctIndex: options.indexOf(correctOption),
    mode: 'retrieval',
    contextNote,
    explanation: primary.answer,
    source: buildQuizSource(primary),
  };
}

function pickRandomChunk(recentSourceIds: string[] = []): RetrievedChunk | null {
  const recentSourceIdSet = new Set(recentSourceIds);
  const corpus = getRagCorpus();
  if (corpus.length === 0) return null;

  const availableCorpus = corpus.filter(
    (chunk) => !recentSourceIdSet.has(chunk.id)
  );
  const pool = availableCorpus.length > 0 ? availableCorpus : corpus;

  return pool[randomInt(0, pool.length - 1)] ?? null;
}

function generate(
  retrievedChunks: RankedRetrievedChunk[],
  options: GenerateRetrievalQuizOptions = {}
): QuizQuestion | null {
  if (hasConfidentRetrievalMatch(retrievedChunks)) {
    return buildQuestion(retrievedChunks[0].chunk, retrievedChunks);
  }

  const fallbackChunk = pickRandomChunk(options.recentSourceIds);
  if (!fallbackChunk) return null;

  return buildQuestion(
    fallbackChunk,
    retrievedChunks,
    RANDOM_FALLBACK_NOTE
  );
}

export const retrievalQuizGenerator = { generate };
