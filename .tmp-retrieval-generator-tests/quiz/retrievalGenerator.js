"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retrievalQuizGenerator = void 0;
exports.hasConfidentRetrievalMatch = hasConfidentRetrievalMatch;
const corpus_1 = require("../lib/rag/corpus");
const DISTRACTOR_COUNT = 3;
const MAX_OPTION_CHARS = 140;
const MIN_PRIMARY_SCORE = 12;
const MIN_SCORE_GAP = 5;
const RETRIEVED_DISTRACTOR_BONUS = 6;
const SHARED_TAG_WEIGHT = 2;
const ANSWER_OVERLAP_PENALTY = 2;
const RANDOM_FALLBACK_NOTE = 'No appropriate related question found. Here is a random review question from the RAG database.';
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function clampText(value, maxChars) {
    if (value.length <= maxChars)
        return value;
    const sliced = value.slice(0, maxChars).trimEnd();
    const lastSpace = sliced.lastIndexOf(' ');
    if (lastSpace <= Math.floor(maxChars * 0.6)) {
        return `${sliced}...`;
    }
    return `${sliced.slice(0, lastSpace)}...`;
}
function normalizeText(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function uniqueTokens(value) {
    const normalized = normalizeText(value);
    if (!normalized)
        return [];
    return [...new Set(normalized.split(' ').filter(Boolean))];
}
function summarizeAnswer(answer) {
    const normalized = answer.replace(/\s+/g, ' ').trim();
    if (!normalized)
        return '';
    const firstSentenceMatch = normalized.match(/^.+?[.!?](?:\s|$)/);
    const summary = firstSentenceMatch?.[0]?.trim() ?? normalized;
    return clampText(summary, MAX_OPTION_CHARS);
}
function shuffle(values) {
    const copy = [...values];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = randomInt(0, i);
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}
function answerOverlap(primary, candidate) {
    const primaryTokens = new Set(uniqueTokens(summarizeAnswer(primary.answer)));
    return uniqueTokens(summarizeAnswer(candidate.answer)).filter((token) => primaryTokens.has(token)).length;
}
function scoreDistractor(primary, candidate, retrievalRank = -1) {
    let score = 0;
    if (candidate.category === primary.category)
        score += 4;
    if (candidate.subcategory && candidate.subcategory === primary.subcategory) {
        score += 2;
    }
    const primaryTags = new Set(primary.tags);
    for (const tag of candidate.tags) {
        if (primaryTags.has(tag))
            score += SHARED_TAG_WEIGHT;
    }
    if (retrievalRank >= 0) {
        score += Math.max(RETRIEVED_DISTRACTOR_BONUS - retrievalRank, 1);
    }
    return score - answerOverlap(primary, candidate) * ANSWER_OVERLAP_PENALTY;
}
function buildDistractorPool(primary, retrievedChunks) {
    const seenIds = new Set([primary.id]);
    const pool = [];
    retrievedChunks.slice(1).forEach((result, index) => {
        if (seenIds.has(result.chunk.id))
            return;
        seenIds.add(result.chunk.id);
        pool.push({ candidate: result.chunk, retrievalRank: index });
    });
    (0, corpus_1.getRagCorpus)().forEach((candidate) => {
        if (seenIds.has(candidate.id))
            return;
        seenIds.add(candidate.id);
        pool.push({ candidate, retrievalRank: -1 });
    });
    return pool;
}
function pickDistractorOptions(primary, retrievedChunks) {
    const correctOption = summarizeAnswer(primary.answer);
    const seen = new Set([correctOption]);
    return buildDistractorPool(primary, retrievedChunks)
        .sort((left, right) => {
        const scoreDelta = scoreDistractor(primary, right.candidate, right.retrievalRank) -
            scoreDistractor(primary, left.candidate, left.retrievalRank);
        if (scoreDelta !== 0)
            return scoreDelta;
        return left.candidate.id.localeCompare(right.candidate.id);
    })
        .map(({ candidate }) => summarizeAnswer(candidate.answer))
        .filter((option) => {
        if (!option || seen.has(option))
            return false;
        seen.add(option);
        return true;
    })
        .slice(0, DISTRACTOR_COUNT);
}
function hasConfidentRetrievalMatch(retrievedChunks) {
    if (retrievedChunks.length === 0)
        return false;
    const [primary, secondary] = retrievedChunks;
    if (primary.score < MIN_PRIMARY_SCORE)
        return false;
    if (!secondary)
        return true;
    return primary.score - secondary.score >= MIN_SCORE_GAP;
}
function normalizeQuestion(question, title) {
    const normalized = question.replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return `Which answer best explains "${title}"?`;
    }
    return normalized;
}
function buildQuizSource(chunk) {
    return {
        id: chunk.id,
        corpus: chunk.corpus,
        category: chunk.category,
        subcategory: chunk.subcategory,
        title: chunk.title,
        question: chunk.question,
        answer: chunk.answer,
        tags: [...chunk.tags],
        source: { ...chunk.source },
    };
}
function buildQuestion(primary, retrievedChunks, contextNote) {
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
function pickRandomChunk(recentSourceIds = []) {
    const recentSourceIdSet = new Set(recentSourceIds);
    const corpus = (0, corpus_1.getRagCorpus)();
    if (corpus.length === 0)
        return null;
    const availableCorpus = corpus.filter((chunk) => !recentSourceIdSet.has(chunk.id));
    const pool = availableCorpus.length > 0 ? availableCorpus : corpus;
    return pool[randomInt(0, pool.length - 1)] ?? null;
}
function generate(retrievedChunks, options = {}) {
    if (hasConfidentRetrievalMatch(retrievedChunks)) {
        return buildQuestion(retrievedChunks[0].chunk, retrievedChunks);
    }
    const fallbackChunk = pickRandomChunk(options.recentSourceIds);
    if (!fallbackChunk)
        return null;
    return buildQuestion(fallbackChunk, retrievedChunks, RANDOM_FALLBACK_NOTE);
}
exports.retrievalQuizGenerator = { generate };
