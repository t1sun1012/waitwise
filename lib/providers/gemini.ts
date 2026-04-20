import type { QuizQuestion } from '../../types/messages';
import type { ConversationContext, RankedRetrievedChunk } from '../../types/rag';
import {
  buildGeneralPromptText,
  buildGeneralQuizQuestion,
  buildMathPromptText,
  buildMathQuizQuestion,
  buildRetrievalPromptText,
  buildRetrievalQuizQuestion,
  type GeneralGeneratedQuiz,
  GENERAL_SCHEMA,
  type MathGeneratedQuiz,
  MATH_SCHEMA,
  normalizeGeneralGeneratedQuiz,
  normalizeMathGeneratedQuiz,
  normalizeRetrievalGeneratedQuiz,
  type RetrievalGeneratedQuiz,
  RETRIEVAL_SCHEMA,
  type StructuredSchema,
} from './shared';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_TIMEOUT_MS = 12000;
const MAX_DEBUG_TEXT_CHARS = 1600;
const RETRIEVAL_MAX_OUTPUT_TOKENS = 220;
const GENERAL_MAX_OUTPUT_TOKENS = 260;
const MATH_MAX_OUTPUT_TOKENS = 180;

interface GeminiResponseResult {
  ok: boolean;
  status: number;
  responseJson: unknown;
  rawText: string | null;
}

interface GenerateRetrievalQuizWithGeminiParams {
  apiKey: string;
  retrievalContext?: ConversationContext;
  retrievedChunks: RankedRetrievedChunk[];
}

interface GenerateGeneralQuizWithGeminiParams {
  apiKey: string;
  currentPrompt: string;
  recentUserPrompts?: string[];
}

interface GenerateMathQuizWithGeminiParams {
  apiKey: string;
  currentPrompt?: string;
}

export const buildRetrievalGeminiPromptText = buildRetrievalPromptText;
export const buildGeneralGeminiPromptText = buildGeneralPromptText;
export const buildMathGeminiPromptText = buildMathPromptText;
export const normalizeRetrievalGeminiGeneratedQuiz =
  normalizeRetrievalGeneratedQuiz;
export const normalizeGeneralGeminiGeneratedQuiz = normalizeGeneralGeneratedQuiz;
export const normalizeMathGeminiGeneratedQuiz = normalizeMathGeneratedQuiz;
export const buildRetrievalQuizQuestionFromGeminiOutput = buildRetrievalQuizQuestion;
export const buildGeneralQuizQuestionFromGeminiOutput = buildGeneralQuizQuestion;
export const buildMathQuizQuestionFromGeminiOutput = buildMathQuizQuestion;

function clampDebugText(value: string): string {
  if (value.length <= MAX_DEBUG_TEXT_CHARS) return value;
  return `${value.slice(0, MAX_DEBUG_TEXT_CHARS)}...`;
}

export function extractGeminiText(responseJson: unknown): string | null {
  if (!responseJson || typeof responseJson !== 'object') return null;

  const candidates = (responseJson as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const firstCandidate = candidates[0] as {
    content?: { parts?: Array<{ text?: unknown }> };
  };
  const parts = firstCandidate.content?.parts;
  if (!Array.isArray(parts)) return null;

  const textPart = parts.find((part) => typeof part?.text === 'string');
  return typeof textPart?.text === 'string' ? textPart.text : null;
}

export function extractJsonPayload(rawText: string): string | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

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

export function extractGeminiDebugMeta(responseJson: unknown): {
  finishReason: string | null;
  promptTokenCount: number | null;
  candidatesTokenCount: number | null;
} {
  const candidate =
    Array.isArray((responseJson as { candidates?: unknown })?.candidates) &&
    (responseJson as { candidates: Array<{ finishReason?: unknown }> }).candidates[0]
      ? (responseJson as {
          candidates: Array<{ finishReason?: unknown }>;
        }).candidates[0]
      : null;

  const usageMetadata = (responseJson as {
    usageMetadata?: {
      promptTokenCount?: unknown;
      candidatesTokenCount?: unknown;
    };
  })?.usageMetadata;

  return {
    finishReason:
      typeof candidate?.finishReason === 'string'
        ? candidate.finishReason
        : null,
    promptTokenCount:
      typeof usageMetadata?.promptTokenCount === 'number'
        ? usageMetadata.promptTokenCount
        : null,
    candidatesTokenCount:
      typeof usageMetadata?.candidatesTokenCount === 'number'
        ? usageMetadata.candidatesTokenCount
        : null,
  };
}

async function requestGeminiContent(
  apiKey: string,
  promptText: string,
  schema: StructuredSchema,
  maxOutputTokens: number,
  controller: AbortController
): Promise<GeminiResponseResult> {
  const endpointUrl = new URL(GEMINI_ENDPOINT);
  endpointUrl.searchParams.set('key', apiKey);

  const response = await fetch(endpointUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
          propertyOrdering: schema.propertyOrdering,
          properties: schema.properties,
          required: schema.required,
        },
        candidateCount: 1,
        temperature: 0.2,
        maxOutputTokens,
      },
    }),
    signal: controller.signal,
  });

  const responseJson = (await response.json()) as unknown;

  return {
    ok: response.ok,
    status: response.status,
    responseJson,
    rawText: extractGeminiText(responseJson),
  };
}

interface GenerateGeminiQuizConfig<TGeneratedQuiz> {
  label: 'retrieval' | 'general' | 'math';
  apiKey: string;
  buildPromptText: (options?: { retry?: boolean }) => string;
  schema: StructuredSchema;
  maxOutputTokens: number;
  normalizeQuiz: (payload: unknown) => TGeneratedQuiz | null;
  buildQuestion: (generatedQuiz: TGeneratedQuiz) => QuizQuestion | null;
}

async function generateGeminiQuiz<TGeneratedQuiz>(
  config: GenerateGeminiQuizConfig<TGeneratedQuiz>
): Promise<QuizQuestion | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    for (const attempt of [0, 1]) {
      const promptText = config.buildPromptText({ retry: attempt > 0 });
      const result = await requestGeminiContent(
        config.apiKey,
        promptText,
        config.schema,
        config.maxOutputTokens,
        controller
      );
      const debugMeta = extractGeminiDebugMeta(result.responseJson);

      if (!result.ok) {
        console.warn(`[wAItwise] Gemini ${config.label} request failed:`, {
          status: result.status,
          body: result.responseJson,
          debugMeta,
        });
        return null;
      }

      console.log(
        `[wAItwise] Gemini ${config.label} raw output${attempt > 0 ? ' (retry)' : ''}:`,
        result.rawText ? clampDebugText(result.rawText) : result.responseJson
      );
      console.log(
        `[wAItwise] Gemini ${config.label} response meta${attempt > 0 ? ' (retry)' : ''}:`,
        debugMeta
      );

      if (!result.rawText) {
        if (attempt === 0) continue;
        return null;
      }

      const extractedJson = extractJsonPayload(result.rawText);
      console.log(
        `[wAItwise] Gemini ${config.label} extracted JSON payload${attempt > 0 ? ' (retry)' : ''}:`,
        extractedJson ? clampDebugText(extractedJson) : null
      );

      if (!extractedJson) {
        if (attempt === 0) continue;
        return null;
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(extractedJson);
      } catch (error) {
        console.warn(`[wAItwise] Gemini ${config.label} JSON parse failed:`, error);
        if (attempt === 0) continue;
        return null;
      }

      const normalizedQuiz = config.normalizeQuiz(parsedJson);
      console.log(
        `[wAItwise] Gemini ${config.label} parsed quiz${attempt > 0 ? ' (retry)' : ''}:`,
        normalizedQuiz
      );
      if (!normalizedQuiz) {
        if (attempt === 0) continue;
        return null;
      }

      return config.buildQuestion(normalizedQuiz);
    }

    return null;
  } catch (error) {
    console.warn(`[wAItwise] Gemini ${config.label} fetch failed:`, error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function generateRetrievalQuizWithGemini(
  params: GenerateRetrievalQuizWithGeminiParams
): Promise<QuizQuestion | null> {
  return generateGeminiQuiz<RetrievalGeneratedQuiz>({
    label: 'retrieval',
    apiKey: params.apiKey,
    buildPromptText: (options) => buildRetrievalPromptText(params, options),
    schema: RETRIEVAL_SCHEMA,
    maxOutputTokens: RETRIEVAL_MAX_OUTPUT_TOKENS,
    normalizeQuiz: normalizeRetrievalGeneratedQuiz,
    buildQuestion: (generatedQuiz) =>
      buildRetrievalQuizQuestion(generatedQuiz, params.retrievedChunks),
  });
}

export async function generateGeneralQuizWithGemini(
  params: GenerateGeneralQuizWithGeminiParams
): Promise<QuizQuestion | null> {
  return generateGeminiQuiz<GeneralGeneratedQuiz>({
    label: 'general',
    apiKey: params.apiKey,
    buildPromptText: (options) => buildGeneralPromptText(params, options),
    schema: GENERAL_SCHEMA,
    maxOutputTokens: GENERAL_MAX_OUTPUT_TOKENS,
    normalizeQuiz: normalizeGeneralGeneratedQuiz,
    buildQuestion: buildGeneralQuizQuestion,
  });
}

export async function generateMathQuizWithGemini(
  params: GenerateMathQuizWithGeminiParams
): Promise<QuizQuestion | null> {
  return generateGeminiQuiz<MathGeneratedQuiz>({
    label: 'math',
    apiKey: params.apiKey,
    buildPromptText: (options) => buildMathPromptText(params, options),
    schema: MATH_SCHEMA,
    maxOutputTokens: MATH_MAX_OUTPUT_TOKENS,
    normalizeQuiz: normalizeMathGeneratedQuiz,
    buildQuestion: buildMathQuizQuestion,
  });
}
