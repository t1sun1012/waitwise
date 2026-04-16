import { getRagCorpus } from './corpus';
import type {
  RankedRetrievedChunk,
  RetrievedChunk,
  RetrievalSignal,
} from '../../types/rag';

const TAG_MATCH_WEIGHT = 5;
const KEYWORD_MATCH_WEIGHT = 3;
const CATEGORY_MATCH_WEIGHT = 4;
const SUBCATEGORY_MATCH_WEIGHT = 4;
const TITLE_TOKEN_WEIGHT = 3;
const TEXT_TOKEN_WEIGHT = 1;
const MAX_TITLE_TOKEN_MATCHES = 3;
const MAX_TEXT_TOKEN_MATCHES = 8;

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'do',
  'for',
  'from',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'me',
  'my',
  'of',
  'on',
  'or',
  'so',
  'that',
  'the',
  'their',
  'this',
  'to',
  'use',
  'using',
  'what',
  'when',
  'why',
  'with',
  'you',
  'your',
]);

export interface RetrieveRelevantChunksOptions {
  topK?: number;
  minScore?: number;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  const normalized = normalizeText(value);
  if (!normalized) return [];

  return normalized
    .split(' ')
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function uniqueTokens(value: string): string[] {
  return [...new Set(tokenize(value))];
}

function phraseInQuery(query: string, phrase: string): boolean {
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase) return false;

  return ` ${query} `.includes(` ${normalizedPhrase} `);
}

function intersection(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((token) => rightSet.has(token));
}

function buildSignalsForChunk(
  chunk: RetrievedChunk,
  normalizedQuery: string,
  queryTokens: string[]
): RetrievalSignal[] {
  const signals: RetrievalSignal[] = [];

  for (const tag of chunk.tags) {
    if (phraseInQuery(normalizedQuery, tag)) {
      signals.push({ kind: 'tag', value: tag, weight: TAG_MATCH_WEIGHT });
    }
  }

  for (const keyword of chunk.keywords) {
    if (phraseInQuery(normalizedQuery, keyword)) {
      signals.push({
        kind: 'keyword',
        value: keyword,
        weight: KEYWORD_MATCH_WEIGHT,
      });
    }
  }

  if (phraseInQuery(normalizedQuery, chunk.category)) {
    signals.push({
      kind: 'category',
      value: chunk.category,
      weight: CATEGORY_MATCH_WEIGHT,
    });
  }

  if (chunk.subcategory && phraseInQuery(normalizedQuery, chunk.subcategory)) {
    signals.push({
      kind: 'subcategory',
      value: chunk.subcategory,
      weight: SUBCATEGORY_MATCH_WEIGHT,
    });
  }

  const titleOverlap = intersection(uniqueTokens(chunk.title), queryTokens).slice(
    0,
    MAX_TITLE_TOKEN_MATCHES
  );
  for (const token of titleOverlap) {
    signals.push({
      kind: 'title-token',
      value: token,
      weight: TITLE_TOKEN_WEIGHT,
    });
  }

  const textOverlap = intersection(
    uniqueTokens(`${chunk.question} ${chunk.answer} ${chunk.text}`),
    queryTokens
  ).slice(0, MAX_TEXT_TOKEN_MATCHES);
  for (const token of textOverlap) {
    signals.push({
      kind: 'text-token',
      value: token,
      weight: TEXT_TOKEN_WEIGHT,
    });
  }

  return signals;
}

function scoreChunk(chunk: RetrievedChunk, query: string): RankedRetrievedChunk {
  const normalizedQuery = normalizeText(query);
  const queryTokens = uniqueTokens(query);
  const signals = buildSignalsForChunk(chunk, normalizedQuery, queryTokens);
  const score = signals.reduce((sum, signal) => sum + signal.weight, 0);

  return {
    chunk,
    score,
    signals,
  };
}

export function retrieveRelevantChunks(
  query: string,
  options: RetrieveRelevantChunksOptions = {}
): RankedRetrievedChunk[] {
  const topK = options.topK ?? 3;
  const minScore = options.minScore ?? 1;
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) return [];

  return getRagCorpus()
    .map((chunk) => scoreChunk(chunk, normalizedQuery))
    .filter((result) => result.score >= minScore)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.chunk.id.localeCompare(right.chunk.id);
    })
    .slice(0, topK);
}
