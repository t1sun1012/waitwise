import type { QuizQuestion } from '../../types/messages';
import type { ConversationContext, RankedRetrievedChunk } from '../../types/rag';
import {
  buildGeneralPromptText,
  buildGeneralQuizQuestion,
  buildMathPromptText,
  buildMathQuizQuestion,
  buildRetrievalPromptText,
  buildRetrievalQuizQuestion,
  buildStructuredOutputSchema,
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

const OPENAI_MODEL = 'gpt-4.1-mini';
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/responses';
const OPENAI_TIMEOUT_MS = 12000;
const MAX_DEBUG_TEXT_CHARS = 1600;
const RETRIEVAL_MAX_OUTPUT_TOKENS = 220;
const GENERAL_MAX_OUTPUT_TOKENS = 260;
const MATH_MAX_OUTPUT_TOKENS = 180;

interface GenerateRetrievalQuizWithOpenAIParams {
  apiKey: string;
  retrievalContext?: ConversationContext;
  retrievedChunks: RankedRetrievedChunk[];
}

interface GenerateGeneralQuizWithOpenAIParams {
  apiKey: string;
  currentPrompt: string;
  recentUserPrompts?: string[];
}

interface GenerateMathQuizWithOpenAIParams {
  apiKey: string;
  currentPrompt?: string;
}

interface OpenAIResponseResult {
  ok: boolean;
  status: number;
  responseJson: unknown;
  rawText: string | null;
}

function clampDebugText(value: string): string {
  if (value.length <= MAX_DEBUG_TEXT_CHARS) return value;
  return `${value.slice(0, MAX_DEBUG_TEXT_CHARS)}...`;
}

export function buildOpenAIResponsesRequestBody(
  promptText: string,
  schema: StructuredSchema,
  maxOutputTokens: number
): Record<string, unknown> {
  return {
    model: OPENAI_MODEL,
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: promptText }],
      },
    ],
    max_output_tokens: maxOutputTokens,
    text: {
      format: {
        type: 'json_schema',
        name: schema.name,
        strict: true,
        schema: buildStructuredOutputSchema(schema),
      },
    },
  };
}

export function extractOpenAIOutputText(responseJson: unknown): string | null {
  if (!responseJson || typeof responseJson !== 'object') return null;

  const directOutputText = (responseJson as { output_text?: unknown }).output_text;
  if (typeof directOutputText === 'string' && directOutputText.trim()) {
    return directOutputText;
  }

  const output = (responseJson as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;

  for (const item of output) {
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (
        (block as { type?: unknown }).type === 'output_text' &&
        typeof (block as { text?: unknown }).text === 'string'
      ) {
        return (block as { text: string }).text;
      }
    }
  }

  return null;
}

export function extractOpenAIDebugMeta(responseJson: unknown): {
  status: string | null;
  reason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
} {
  const usage = (responseJson as {
    usage?: { input_tokens?: unknown; output_tokens?: unknown };
  })?.usage;
  const incompleteDetails = (responseJson as {
    incomplete_details?: { reason?: unknown };
  })?.incomplete_details;

  return {
    status:
      typeof (responseJson as { status?: unknown })?.status === 'string'
        ? ((responseJson as { status: string }).status ?? null)
        : null,
    reason:
      typeof incompleteDetails?.reason === 'string' ? incompleteDetails.reason : null,
    inputTokens:
      typeof usage?.input_tokens === 'number' ? usage.input_tokens : null,
    outputTokens:
      typeof usage?.output_tokens === 'number' ? usage.output_tokens : null,
  };
}

async function requestOpenAIContent(
  apiKey: string,
  promptText: string,
  schema: StructuredSchema,
  maxOutputTokens: number,
  controller: AbortController
): Promise<OpenAIResponseResult> {
  const response = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(
      buildOpenAIResponsesRequestBody(promptText, schema, maxOutputTokens)
    ),
    signal: controller.signal,
  });

  const responseJson = (await response.json()) as unknown;

  return {
    ok: response.ok,
    status: response.status,
    responseJson,
    rawText: extractOpenAIOutputText(responseJson),
  };
}

interface GenerateOpenAIQuizConfig<TGeneratedQuiz> {
  label: 'retrieval' | 'general' | 'math';
  apiKey: string;
  buildPromptText: (options?: { retry?: boolean }) => string;
  schema: StructuredSchema;
  maxOutputTokens: number;
  normalizeQuiz: (payload: unknown) => TGeneratedQuiz | null;
  buildQuestion: (generatedQuiz: TGeneratedQuiz) => QuizQuestion | null;
}

async function generateOpenAIQuiz<TGeneratedQuiz>(
  config: GenerateOpenAIQuizConfig<TGeneratedQuiz>
): Promise<QuizQuestion | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    for (const attempt of [0, 1]) {
      const promptText = config.buildPromptText({ retry: attempt > 0 });
      const result = await requestOpenAIContent(
        config.apiKey,
        promptText,
        config.schema,
        config.maxOutputTokens,
        controller
      );
      const debugMeta = extractOpenAIDebugMeta(result.responseJson);

      if (!result.ok) {
        console.warn(`[wAItwise] OpenAI ${config.label} request failed:`, {
          status: result.status,
          body: result.responseJson,
          debugMeta,
        });
        return null;
      }

      console.log(
        `[wAItwise] OpenAI ${config.label} raw output${attempt > 0 ? ' (retry)' : ''}:`,
        result.rawText ? clampDebugText(result.rawText) : result.responseJson
      );
      console.log(
        `[wAItwise] OpenAI ${config.label} response meta${attempt > 0 ? ' (retry)' : ''}:`,
        debugMeta
      );

      if (!result.rawText) {
        if (attempt === 0) continue;
        return null;
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(result.rawText);
      } catch (error) {
        console.warn(`[wAItwise] OpenAI ${config.label} JSON parse failed:`, error);
        if (attempt === 0) continue;
        return null;
      }

      const normalizedQuiz = config.normalizeQuiz(parsedJson);
      console.log(
        `[wAItwise] OpenAI ${config.label} parsed quiz${attempt > 0 ? ' (retry)' : ''}:`,
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
    console.warn(`[wAItwise] OpenAI ${config.label} fetch failed:`, error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function generateRetrievalQuizWithOpenAI(
  params: GenerateRetrievalQuizWithOpenAIParams
): Promise<QuizQuestion | null> {
  return generateOpenAIQuiz<RetrievalGeneratedQuiz>({
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

export async function generateGeneralQuizWithOpenAI(
  params: GenerateGeneralQuizWithOpenAIParams
): Promise<QuizQuestion | null> {
  return generateOpenAIQuiz<GeneralGeneratedQuiz>({
    label: 'general',
    apiKey: params.apiKey,
    buildPromptText: (options) => buildGeneralPromptText(params, options),
    schema: GENERAL_SCHEMA,
    maxOutputTokens: GENERAL_MAX_OUTPUT_TOKENS,
    normalizeQuiz: normalizeGeneralGeneratedQuiz,
    buildQuestion: buildGeneralQuizQuestion,
  });
}

export async function generateMathQuizWithOpenAI(
  params: GenerateMathQuizWithOpenAIParams
): Promise<QuizQuestion | null> {
  return generateOpenAIQuiz<MathGeneratedQuiz>({
    label: 'math',
    apiKey: params.apiKey,
    buildPromptText: (options) => buildMathPromptText(params, options),
    schema: MATH_SCHEMA,
    maxOutputTokens: MATH_MAX_OUTPUT_TOKENS,
    normalizeQuiz: normalizeMathGeneratedQuiz,
    buildQuestion: buildMathQuizQuestion,
  });
}
