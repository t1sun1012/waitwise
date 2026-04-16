"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildConversationContext = buildConversationContext;
exports.buildRetrievalQuery = buildRetrievalQuery;
const corpus_1 = require("./corpus");
const MAX_RECENT_USER_PROMPTS = 3;
const MAX_RECENT_ASSISTANT_REPLIES = 2;
const MAX_ENTITIES = 4;
const MAX_RELATED_CONCEPTS = 4;
const MAX_RETRIEVAL_QUERIES = 3;
const MAX_QUERY_CHARS = 140;
const MAX_QUERY_PARTS = 7;
const CURRENT_USER_WEIGHT = 8;
const PREVIOUS_USER_WEIGHTS = [4, 2, 1];
const ASSISTANT_WEIGHT = 3;
const CORPUS_PHRASE_BONUS = 2;
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
    'can',
    'could',
    'do',
    'does',
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
    'our',
    'should',
    'so',
    'than',
    'that',
    'the',
    'their',
    'them',
    'this',
    'to',
    'us',
    'we',
    'what',
    'when',
    'where',
    'while',
    'which',
    'who',
    'why',
    'with',
    'would',
    'you',
    'your',
]);
const LOW_SIGNAL_TOKENS = new Set([
    'about',
    'benefit',
    'benefits',
    'briefly',
    'between',
    'case',
    'cases',
    'compare',
    'contrasted',
    'define',
    'difference',
    'differences',
    'edge',
    'example',
    'examples',
    'explain',
    'further',
    'give',
    'got',
    'help',
    'interview',
    'major',
    'matters',
    'metric',
    'more',
    'okay',
    'please',
    'predict',
    'predicts',
    'question',
    'questions',
    'recent',
    'recently',
    'review',
    'show',
    'state',
    'technical',
    'tell',
    'thanks',
    'thank',
    'understand',
    'used',
    'using',
    'walk',
    'work',
    'works',
    'yep',
    'yes',
]);
const TECHNICAL_TAIL_TOKENS = new Set([
    'attention',
    'bias',
    'classification',
    'curve',
    'decoder',
    'distribution',
    'drift',
    'encoder',
    'framework',
    'function',
    'gain',
    'gradient',
    'join',
    'key',
    'learning',
    'normalization',
    'optimizer',
    'regression',
    'testing',
    'theorem',
    'tree',
]);
function normalizeText(value) {
    return value?.replace(/\s+/g, ' ').trim().toLowerCase() ?? '';
}
function normalizeSearchText(value) {
    return normalizeText(value).replace(/[^a-z0-9\s]/g, ' ');
}
function tokenize(value) {
    return normalizeText(value)
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(' ')
        .filter(Boolean);
}
function extractTopicTokens(value) {
    return tokenize(value).filter((token) => token.length > 1 &&
        !STOPWORDS.has(token) &&
        !LOW_SIGNAL_TOKENS.has(token));
}
function phraseInText(text, phrase) {
    if (!text || !phrase)
        return false;
    return ` ${normalizeSearchText(text)} `.includes(` ${normalizeSearchText(phrase)} `);
}
function dedupeTexts(values) {
    const seen = new Set();
    const deduped = [];
    values.forEach((value) => {
        const normalized = normalizeText(value);
        if (!normalized || seen.has(normalized))
            return;
        seen.add(normalized);
        deduped.push(normalized);
    });
    return deduped;
}
function buildAdjacentPhrases(tokens, minSize = 2, maxSize = 3) {
    const phrases = [];
    for (let size = maxSize; size >= minSize; size -= 1) {
        for (let index = 0; index <= tokens.length - size; index += 1) {
            phrases.push(tokens.slice(index, index + size).join(' '));
        }
    }
    return phrases;
}
function addCorpusPhrase(map, phrase, weight) {
    const normalized = normalizeText(phrase);
    const tokens = extractTopicTokens(normalized);
    if (tokens.length === 0)
        return;
    const normalizedPhrase = tokens.join(' ');
    if (!normalizedPhrase)
        return;
    const existing = map.get(normalizedPhrase);
    if (existing) {
        existing.weight = Math.max(existing.weight, weight);
        return;
    }
    map.set(normalizedPhrase, {
        phrase: normalizedPhrase,
        tokens,
        weight,
    });
}
function buildCorpusPhraseIndex() {
    const phraseMap = new Map();
    (0, corpus_1.getRagCorpus)().forEach((chunk) => {
        chunk.keywords.forEach((keyword) => addCorpusPhrase(phraseMap, keyword, 5));
        chunk.tags.forEach((tag) => addCorpusPhrase(phraseMap, tag, 4));
        addCorpusPhrase(phraseMap, chunk.category, 3);
        if (chunk.subcategory) {
            addCorpusPhrase(phraseMap, chunk.subcategory, 3);
        }
        buildAdjacentPhrases(extractTopicTokens(chunk.title)).forEach((phrase) => addCorpusPhrase(phraseMap, phrase, 4));
    });
    return [...phraseMap.values()].sort((left, right) => {
        if (right.tokens.length !== left.tokens.length) {
            return right.tokens.length - left.tokens.length;
        }
        if (right.weight !== left.weight) {
            return right.weight - left.weight;
        }
        return left.phrase.localeCompare(right.phrase);
    });
}
const CORPUS_PHRASES = buildCorpusPhraseIndex();
function addWeightedPhrase(phrases, phrase, score, firstSeen) {
    if (!phrase)
        return;
    const tokens = extractTopicTokens(phrase);
    if (tokens.length === 0)
        return;
    const normalizedPhrase = tokens.join(' ');
    const existing = phrases.get(normalizedPhrase);
    if (existing) {
        existing.score += score;
        existing.firstSeen = Math.min(existing.firstSeen, firstSeen);
        return;
    }
    phrases.set(normalizedPhrase, {
        phrase: normalizedPhrase,
        score,
        firstSeen,
        tokens,
    });
}
function collectCorpusMatches(texts, weight, firstSeenStart) {
    const matches = new Map();
    let firstSeen = firstSeenStart;
    texts.forEach((text) => {
        CORPUS_PHRASES.forEach((phrase) => {
            if (!phraseInText(text, phrase.phrase))
                return;
            addWeightedPhrase(matches, phrase.phrase, weight + phrase.weight + CORPUS_PHRASE_BONUS, firstSeen);
            firstSeen += 1;
        });
    });
    return matches;
}
function sortedPhrases(values) {
    return [...values.values()].sort((left, right) => {
        if (right.score !== left.score) {
            return right.score - left.score;
        }
        if (right.tokens.length !== left.tokens.length) {
            return right.tokens.length - left.tokens.length;
        }
        return left.firstSeen - right.firstSeen;
    });
}
function pickTopPhrases(values, maxCount) {
    const selected = [];
    const coveredTokens = new Set();
    for (const phrase of sortedPhrases(values)) {
        if (phrase.tokens.length === 1 &&
            coveredTokens.has(phrase.tokens[0])) {
            continue;
        }
        selected.push(phrase.phrase);
        phrase.tokens.forEach((token) => coveredTokens.add(token));
        if (selected.length >= maxCount) {
            break;
        }
    }
    return selected;
}
function mergeWeightedPhrases(target, source) {
    source.forEach((phrase) => {
        addWeightedPhrase(target, phrase.phrase, phrase.score, phrase.firstSeen);
    });
}
function buildFallbackWeightedQuery(currentPrompt, previousUserPrompts, recentAssistantReplies) {
    const phrases = new Map();
    let firstSeen = 0;
    buildAdjacentPhrases(extractTopicTokens(currentPrompt)).forEach((phrase) => {
        addWeightedPhrase(phrases, phrase, CURRENT_USER_WEIGHT, firstSeen);
        firstSeen += 1;
    });
    extractTopicTokens(currentPrompt).forEach((token) => {
        addWeightedPhrase(phrases, token, CURRENT_USER_WEIGHT - 2, firstSeen);
        firstSeen += 1;
    });
    previousUserPrompts
        .slice()
        .reverse()
        .forEach((prompt, index) => {
        const weight = PREVIOUS_USER_WEIGHTS[index] ?? 1;
        buildAdjacentPhrases(extractTopicTokens(prompt)).forEach((phrase) => {
            addWeightedPhrase(phrases, phrase, weight, firstSeen);
            firstSeen += 1;
        });
    });
    recentAssistantReplies.forEach((reply) => {
        buildAdjacentPhrases(extractTopicTokens(reply)).forEach((phrase) => {
            addWeightedPhrase(phrases, phrase, ASSISTANT_WEIGHT, firstSeen);
            firstSeen += 1;
        });
    });
    const parts = [];
    let totalChars = 0;
    for (const phrase of sortedPhrases(phrases)) {
        const nextLength = totalChars + phrase.phrase.length + (parts.length > 0 ? 1 : 0);
        if (nextLength > MAX_QUERY_CHARS)
            continue;
        parts.push(phrase.phrase);
        totalChars = nextLength;
        if (parts.length >= MAX_QUERY_PARTS)
            break;
    }
    return parts.join(' ');
}
function extractFallbackEntityPhrases(prompt) {
    const tokens = extractTopicTokens(prompt);
    if (tokens.length === 0)
        return [];
    if (tokens.length === 1)
        return tokens;
    const candidatePhrases = buildAdjacentPhrases(tokens, 2, 2)
        .filter((phrase) => {
        const phraseTokens = phrase.split(' ');
        const lastToken = phraseTokens[phraseTokens.length - 1];
        return TECHNICAL_TAIL_TOKENS.has(lastToken);
    })
        .slice(0, MAX_ENTITIES);
    if (candidatePhrases.length > 0) {
        return dedupeTexts([...candidatePhrases, ...tokens]).slice(0, MAX_ENTITIES);
    }
    return dedupeTexts(tokens).slice(0, MAX_ENTITIES);
}
function classifyIntent(currentPrompt, previousUserPrompts) {
    const activePrompt = currentPrompt || previousUserPrompts[previousUserPrompts.length - 1] || '';
    if (/\b(compare|difference|different|versus|vs)\b/.test(activePrompt)) {
        return 'compare';
    }
    if (/\b(example|examples|use case|applications?|used|recently)\b/.test(activePrompt)) {
        return 'example';
    }
    if (/\b(debug|bug|fix|issue|error|failing|broken|problem)\b/.test(activePrompt)) {
        return 'debug';
    }
    if (/^(what is|what are)\b/.test(activePrompt) || /\bdefine\b/.test(activePrompt)) {
        return 'define';
    }
    if (/\b(explain|how does|how do|why)\b/.test(activePrompt)) {
        return 'explain';
    }
    return 'generic';
}
function buildAnchorTokenSet(entities, currentPrompt) {
    const anchorTokens = new Set();
    entities.forEach((entity) => {
        extractTopicTokens(entity).forEach((token) => anchorTokens.add(token));
    });
    if (anchorTokens.size > 0) {
        return anchorTokens;
    }
    extractTopicTokens(currentPrompt).forEach((token) => anchorTokens.add(token));
    return anchorTokens;
}
function collectAssistantConcepts(recentAssistantReplies, anchorTokens, entities) {
    if (anchorTokens.size === 0)
        return [];
    const entitySet = new Set(entities);
    const concepts = new Map();
    let firstSeen = 0;
    recentAssistantReplies
        .slice()
        .reverse()
        .forEach((reply) => {
        reply
            .split(/[\n.!?;:]+/)
            .map((segment) => normalizeText(segment))
            .filter(Boolean)
            .forEach((segment) => {
            const segmentTokens = extractTopicTokens(segment);
            if (!segmentTokens.some((token) => anchorTokens.has(token)))
                return;
            const corpusMatches = collectCorpusMatches([segment], ASSISTANT_WEIGHT, firstSeen);
            corpusMatches.forEach((phrase) => {
                if (entitySet.has(phrase.phrase))
                    return;
                addWeightedPhrase(concepts, phrase.phrase, phrase.score, firstSeen);
                firstSeen += 1;
            });
            extractFallbackEntityPhrases(segment).forEach((phrase) => {
                if (entitySet.has(phrase))
                    return;
                addWeightedPhrase(concepts, phrase, ASSISTANT_WEIGHT, firstSeen);
                firstSeen += 1;
            });
        });
    });
    return pickTopPhrases(concepts, MAX_RELATED_CONCEPTS).filter((phrase) => {
        const phraseTokens = extractTopicTokens(phrase);
        return !phraseTokens.every((token) => anchorTokens.has(token));
    });
}
function buildEntityList(currentMatches, previousMatches, currentUserPrompt) {
    const compactEntities = (values) => {
        const selected = [];
        const coveredTokens = new Set();
        dedupeTexts(values)
            .sort((left, right) => {
            const leftTokenCount = extractTopicTokens(left).length;
            const rightTokenCount = extractTopicTokens(right).length;
            if (rightTokenCount !== leftTokenCount) {
                return rightTokenCount - leftTokenCount;
            }
            return left.localeCompare(right);
        })
            .forEach((value) => {
            const tokens = extractTopicTokens(value);
            if (tokens.length === 1 &&
                coveredTokens.has(tokens[0])) {
                return;
            }
            selected.push(value);
            tokens.forEach((token) => coveredTokens.add(token));
        });
        return selected.slice(0, MAX_ENTITIES);
    };
    const entities = pickTopPhrases(currentMatches, MAX_ENTITIES);
    const fallbackEntities = extractFallbackEntityPhrases(currentUserPrompt);
    if (entities.length > 0) {
        return compactEntities([...entities, ...fallbackEntities]);
    }
    if (fallbackEntities.length > 0) {
        return compactEntities(fallbackEntities);
    }
    return compactEntities(pickTopPhrases(previousMatches, MAX_ENTITIES));
}
function joinQueryParts(parts) {
    const uniqueParts = dedupeTexts(parts);
    const selected = [];
    let totalChars = 0;
    uniqueParts.forEach((part) => {
        const nextLength = totalChars + part.length + (selected.length > 0 ? 1 : 0);
        if (part && nextLength <= MAX_QUERY_CHARS) {
            selected.push(part);
            totalChars = nextLength;
        }
    });
    return selected.join(' ');
}
function buildSummary(intent, entities, relatedConcepts, fallbackQuery) {
    if (entities.length === 0) {
        return fallbackQuery || 'general technical review';
    }
    const base = intent === 'compare' && entities.length >= 2
        ? `compare ${entities[0]} and ${entities[1]}`
        : `${intent === 'generic' ? 'review' : intent} ${entities.join(', ')}`;
    if (relatedConcepts.length === 0) {
        return base;
    }
    return `${base}; related concepts: ${relatedConcepts.join(', ')}`;
}
function buildRetrievalQueriesFromContext(intent, entities, relatedConcepts, fallbackQuery) {
    const queries = [];
    if (intent === 'compare' && entities.length >= 2) {
        queries.push(joinQueryParts([entities[0], entities[1], 'difference']));
        queries.push(joinQueryParts([entities[0], entities[1], ...relatedConcepts.slice(0, 2)]));
    }
    else if (entities.length > 0) {
        queries.push(joinQueryParts([...entities, ...relatedConcepts.slice(0, 2)]));
        if (intent === 'example') {
            queries.push(joinQueryParts([entities[0], 'example', ...relatedConcepts.slice(0, 2)]));
        }
        else if (intent === 'define' || intent === 'explain') {
            queries.push(joinQueryParts([entities[0], 'explain', ...relatedConcepts.slice(0, 2)]));
        }
    }
    if (fallbackQuery) {
        queries.push(fallbackQuery);
    }
    return dedupeTexts(queries).filter(Boolean).slice(0, MAX_RETRIEVAL_QUERIES);
}
function buildConversationContext(input) {
    const currentUserPrompt = normalizeText(input.currentUserPrompt);
    const previousUserPrompts = dedupeTexts((input.recentUserPrompts ?? []).slice(-MAX_RECENT_USER_PROMPTS));
    const recentAssistantReplies = dedupeTexts((input.recentAssistantReplies ?? []).slice(-MAX_RECENT_ASSISTANT_REPLIES));
    const currentMatches = collectCorpusMatches([currentUserPrompt], CURRENT_USER_WEIGHT, 0);
    const previousMatches = collectCorpusMatches(previousUserPrompts.slice().reverse(), PREVIOUS_USER_WEIGHTS[0], 100);
    const entityCandidates = new Map();
    mergeWeightedPhrases(entityCandidates, currentMatches);
    if (entityCandidates.size === 0) {
        mergeWeightedPhrases(entityCandidates, previousMatches);
    }
    const fallbackQuery = buildFallbackWeightedQuery(currentUserPrompt, previousUserPrompts, recentAssistantReplies);
    const intent = classifyIntent(currentUserPrompt, previousUserPrompts);
    const entities = buildEntityList(currentMatches, previousMatches, currentUserPrompt);
    const relatedConcepts = collectAssistantConcepts(recentAssistantReplies, buildAnchorTokenSet(entities, currentUserPrompt), entities);
    const summary = buildSummary(intent, entities, relatedConcepts, fallbackQuery);
    const retrievalQueries = buildRetrievalQueriesFromContext(intent, entities, relatedConcepts, fallbackQuery);
    return {
        currentUserPrompt,
        previousUserPrompts,
        recentAssistantReplies,
        intent,
        entities,
        relatedConcepts,
        summary,
        retrievalQueries,
    };
}
function buildRetrievalQuery(input) {
    const conversationContext = buildConversationContext(input);
    return conversationContext.retrievalQueries[0] ?? conversationContext.summary;
}
