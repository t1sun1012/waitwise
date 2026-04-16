"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildGeminiPromptText = buildGeminiPromptText;
exports.extractGeminiText = extractGeminiText;
exports.extractJsonPayload = extractJsonPayload;
exports.extractGeminiDebugMeta = extractGeminiDebugMeta;
exports.normalizeGeminiGeneratedQuiz = normalizeGeminiGeneratedQuiz;
exports.buildQuizQuestionFromGeminiOutput = buildQuizQuestionFromGeminiOutput;
exports.generateQuizWithGemini = generateQuizWithGemini;
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_TIMEOUT_MS = 12000;
const MAX_SOURCE_CHUNKS = 1;
const MAX_DEBUG_TEXT_CHARS = 1600;
const GEMINI_MAX_OUTPUT_TOKENS = 220;
const MAX_PROMPT_CHARS = 140;
function clampDebugText(value) {
    if (value.length <= MAX_DEBUG_TEXT_CHARS)
        return value;
    return `${value.slice(0, MAX_DEBUG_TEXT_CHARS)}...`;
}
function normalizeText(value) {
    return value?.replace(/\s+/g, ' ').trim() ?? '';
}
function clampPromptText(value, maxChars = MAX_PROMPT_CHARS) {
    if (value.length <= maxChars)
        return value;
    const sliced = value.slice(0, maxChars).trimEnd();
    const lastSpace = sliced.lastIndexOf(' ');
    if (lastSpace <= Math.floor(maxChars * 0.6)) {
        return `${sliced}...`;
    }
    return `${sliced.slice(0, lastSpace)}...`;
}
function buildSourceSummary(retrievedChunks) {
    return JSON.stringify({
        chunks: retrievedChunks.slice(0, MAX_SOURCE_CHUNKS).map((result) => ({
            sourceId: result.chunk.id,
            category: result.chunk.category,
            subcategory: result.chunk.subcategory ?? null,
            title: result.chunk.title,
            answer: clampPromptText(result.chunk.answer),
            tags: result.chunk.tags.slice(0, 4),
        })),
    });
}
function buildGeminiPromptText(params, options) {
    const summary = clampPromptText(normalizeText(params.retrievalContext?.summary));
    const intent = normalizeText(params.retrievalContext?.intent);
    const entities = params.retrievalContext?.entities.slice(0, 4).join(', ') ?? '';
    const relatedConcepts = params.retrievalContext?.relatedConcepts.slice(0, 4).join(', ') ?? '';
    const retrievalQueries = params.retrievalContext?.retrievalQueries.slice(0, 3).join(' | ') ?? '';
    const sourceTitle = clampPromptText(normalizeText(params.retrievedChunks[0]?.chunk.title));
    const isRetry = options?.retry === true;
    return [
        'Generate one grounded technical interview multiple-choice quiz for WaitWise.',
        'Use only the retrieved chunk as truth.',
        'Return raw JSON only.',
        'No markdown. No prose. No prefix or suffix.',
        'Question under 14 words.',
        'Each option under 8 words.',
        'Explanation under 16 words.',
        isRetry
            ? 'Previous response was invalid. Return one minified JSON object only.'
            : '',
        '',
        `Context summary: ${summary || sourceTitle || '(empty)'}`,
        intent ? `Intent: ${intent}` : '',
        entities ? `Key entities: ${entities}` : '',
        relatedConcepts ? `Related concepts: ${relatedConcepts}` : '',
        retrievalQueries ? `Retrieval queries: ${retrievalQueries}` : '',
        `Source: ${buildSourceSummary(params.retrievedChunks)}`,
        'Schema:',
        '{"topic":"string","question":"string","options":["a","b","c","d"],"correctIndex":0,"explanation":"string","sourceId":"string"}',
        'Rules:',
        '- Use the provided sourceId exactly.',
        '- Exactly 4 options.',
        '- correctIndex is 0..3.',
    ].join('\n');
}
function extractGeminiText(responseJson) {
    if (!responseJson || typeof responseJson !== 'object')
        return null;
    const candidates = responseJson.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0)
        return null;
    const firstCandidate = candidates[0];
    const parts = firstCandidate.content?.parts;
    if (!Array.isArray(parts))
        return null;
    const textPart = parts.find((part) => typeof part?.text === 'string');
    return typeof textPart?.text === 'string' ? textPart.text : null;
}
function extractJsonPayload(rawText) {
    const trimmed = rawText.trim();
    if (!trimmed)
        return null;
    const fencedBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedBlockMatch?.[1]) {
        return extractJsonPayload(fencedBlockMatch[1]);
    }
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        return trimmed;
    }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        return trimmed.slice(firstBrace, lastBrace + 1);
    }
    return null;
}
function extractGeminiDebugMeta(responseJson) {
    const candidate = Array.isArray(responseJson?.candidates) &&
        responseJson.candidates[0]
        ? responseJson.candidates[0]
        : null;
    const usageMetadata = responseJson?.usageMetadata;
    return {
        finishReason: typeof candidate?.finishReason === 'string'
            ? candidate.finishReason
            : null,
        promptTokenCount: typeof usageMetadata?.promptTokenCount === 'number'
            ? usageMetadata.promptTokenCount
            : null,
        candidatesTokenCount: typeof usageMetadata?.candidatesTokenCount === 'number'
            ? usageMetadata.candidatesTokenCount
            : null,
    };
}
function normalizeGeminiGeneratedQuiz(payload) {
    if (!payload || typeof payload !== 'object')
        return null;
    const candidate = payload;
    if (typeof candidate.topic !== 'string' ||
        typeof candidate.question !== 'string' ||
        !Array.isArray(candidate.options) ||
        candidate.options.length !== 4 ||
        candidate.options.some((option) => typeof option !== 'string') ||
        typeof candidate.correctIndex !== 'number' ||
        !Number.isInteger(candidate.correctIndex) ||
        candidate.correctIndex < 0 ||
        candidate.correctIndex >= candidate.options.length ||
        typeof candidate.explanation !== 'string' ||
        typeof candidate.sourceId !== 'string') {
        return null;
    }
    const normalized = {
        topic: candidate.topic.trim(),
        question: candidate.question.trim(),
        options: candidate.options.map((option) => option.trim()),
        correctIndex: candidate.correctIndex,
        explanation: candidate.explanation.trim(),
        sourceId: candidate.sourceId.trim(),
    };
    if (!normalized.topic ||
        !normalized.question ||
        !normalized.explanation ||
        !normalized.sourceId ||
        normalized.options.some((option) => option.length === 0)) {
        return null;
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
function buildQuizQuestionFromGeminiOutput(generatedQuiz, retrievedChunks) {
    const matchedChunk = retrievedChunks.find((result) => result.chunk.id === generatedQuiz.sourceId)?.chunk;
    if (!matchedChunk)
        return null;
    return {
        id: `gemini-${generatedQuiz.sourceId}-${Date.now()}`,
        question: generatedQuiz.question,
        options: [...generatedQuiz.options],
        correctIndex: generatedQuiz.correctIndex,
        mode: 'retrieval',
        explanation: generatedQuiz.explanation,
        source: buildQuizSource(matchedChunk),
    };
}
async function requestGeminiContent(apiKey, promptText, controller) {
    const response = await fetch(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
            contents: [
                {
                    role: 'user',
                    parts: [{ text: promptText }],
                },
            ],
            generationConfig: {
                responseMimeType: 'application/json',
                thinkingConfig: {
                    thinkingBudget: 0,
                },
                responseJsonSchema: {
                    type: 'object',
                    propertyOrdering: [
                        'topic',
                        'question',
                        'options',
                        'correctIndex',
                        'explanation',
                        'sourceId',
                    ],
                    properties: {
                        topic: { type: 'string' },
                        question: { type: 'string' },
                        options: {
                            type: 'array',
                            items: { type: 'string' },
                            minItems: 4,
                            maxItems: 4,
                        },
                        correctIndex: { type: 'integer' },
                        explanation: { type: 'string' },
                        sourceId: { type: 'string' },
                    },
                    required: [
                        'topic',
                        'question',
                        'options',
                        'correctIndex',
                        'explanation',
                        'sourceId',
                    ],
                },
                candidateCount: 1,
                temperature: 0.2,
                maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
            },
        }),
        signal: controller.signal,
    });
    const responseJson = (await response.json());
    return {
        ok: response.ok,
        status: response.status,
        responseJson,
        rawText: extractGeminiText(responseJson),
    };
}
async function generateQuizWithGemini(params) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
        for (const attempt of [0, 1]) {
            const promptText = buildGeminiPromptText(params, { retry: attempt > 0 });
            const result = await requestGeminiContent(params.apiKey, promptText, controller);
            const debugMeta = extractGeminiDebugMeta(result.responseJson);
            if (!result.ok) {
                console.warn('[wAItwise] Gemini request failed:', {
                    status: result.status,
                    body: result.responseJson,
                    debugMeta,
                });
                return null;
            }
            console.log(`[wAItwise] Gemini raw output${attempt > 0 ? ' (retry)' : ''}:`, result.rawText ? clampDebugText(result.rawText) : result.responseJson);
            console.log(`[wAItwise] Gemini response meta${attempt > 0 ? ' (retry)' : ''}:`, debugMeta);
            if (!result.rawText) {
                if (attempt === 0)
                    continue;
                return null;
            }
            const extractedJson = extractJsonPayload(result.rawText);
            console.log(`[wAItwise] Gemini extracted JSON payload${attempt > 0 ? ' (retry)' : ''}:`, extractedJson ? clampDebugText(extractedJson) : null);
            if (!extractedJson) {
                if (attempt === 0)
                    continue;
                return null;
            }
            let parsedJson;
            try {
                parsedJson = JSON.parse(extractedJson);
            }
            catch (error) {
                console.warn('[wAItwise] Gemini JSON parse failed:', error);
                if (attempt === 0)
                    continue;
                return null;
            }
            const normalizedQuiz = normalizeGeminiGeneratedQuiz(parsedJson);
            console.log(`[wAItwise] Gemini parsed quiz${attempt > 0 ? ' (retry)' : ''}:`, normalizedQuiz);
            if (!normalizedQuiz) {
                if (attempt === 0)
                    continue;
                return null;
            }
            return buildQuizQuestionFromGeminiOutput(normalizedQuiz, params.retrievedChunks);
        }
        return null;
    }
    catch (error) {
        console.warn('[wAItwise] Gemini fetch failed:', error);
        return null;
    }
    finally {
        clearTimeout(timeoutId);
    }
}
