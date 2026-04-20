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

const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const ANTHROPIC_TIMEOUT_MS = 12000;
const RETRIEVAL_MAX_OUTPUT_TOKENS = 220;
const GENERAL_MAX_OUTPUT_TOKENS = 260;
const MATH_MAX_OUTPUT_TOKENS = 180;

interface GenerateRetrievalQuizWithAnthropicParams {
  apiKey: string;
  retrievalContext?: ConversationContext;
  retrievedChunks: RankedRetrievedChunk[];
}

interface GenerateGeneralQuizWithAnthropicParams {
  apiKey: string;
  currentPrompt: string;
  recentUserPrompts?: string[];
}

interface GenerateMathQuizWithAnthropicParams {
  apiKey: string;
  currentPrompt?: string;
}

interface AnthropicResponseResult {
  ok: boolean;
  status: number;
  responseJson: unknown;
  toolInput: unknown;
}

export function buildAnthropicMessagesRequestBody(
  promptText: string,
  schema: StructuredSchema,
  maxOutputTokens: number
): Record<string, unknown> {
  return {
    model: ANTHROPIC_MODEL,
    max_tokens: maxOutputTokens,
    messages: [{ role: 'user', content: promptText }],
    tools: [
      {
        name: schema.name,
        description:
          'Return the quiz payload in the required structured format only.',
        input_schema: buildStructuredOutputSchema(schema),
      },
    ],
    tool_choice: {
      type: 'tool',
      name: schema.name,
    },
  };
}

export function extractAnthropicToolInput(
  responseJson: unknown,
  toolName: string
): unknown | null {
  if (!responseJson || typeof responseJson !== 'object') return null;

  const content = (responseJson as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;

  for (const block of content) {
    if (
      (block as { type?: unknown }).type === 'tool_use' &&
      (block as { name?: unknown }).name === toolName
    ) {
      return (block as { input?: unknown }).input ?? null;
    }
  }

  return null;
}

export function extractAnthropicDebugMeta(responseJson: unknown): {
  stopReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
} {
  const usage = (responseJson as {
    usage?: { input_tokens?: unknown; output_tokens?: unknown };
  })?.usage;

  return {
    stopReason:
      typeof (responseJson as { stop_reason?: unknown })?.stop_reason === 'string'
        ? ((responseJson as { stop_reason: string }).stop_reason ?? null)
        : null,
    inputTokens:
      typeof usage?.input_tokens === 'number' ? usage.input_tokens : null,
    outputTokens:
      typeof usage?.output_tokens === 'number' ? usage.output_tokens : null,
  };
}

async function requestAnthropicContent(
  apiKey: string,
  promptText: string,
  schema: StructuredSchema,
  maxOutputTokens: number,
  controller: AbortController
): Promise<AnthropicResponseResult> {
  const response = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(
      buildAnthropicMessagesRequestBody(promptText, schema, maxOutputTokens)
    ),
    signal: controller.signal,
  });

  const responseJson = (await response.json()) as unknown;

  return {
    ok: response.ok,
    status: response.status,
    responseJson,
    toolInput: extractAnthropicToolInput(responseJson, schema.name),
  };
}

interface GenerateAnthropicQuizConfig<TGeneratedQuiz> {
  label: 'retrieval' | 'general' | 'math';
  apiKey: string;
  buildPromptText: (options?: { retry?: boolean }) => string;
  schema: StructuredSchema;
  maxOutputTokens: number;
  normalizeQuiz: (payload: unknown) => TGeneratedQuiz | null;
  buildQuestion: (generatedQuiz: TGeneratedQuiz) => QuizQuestion | null;
}

async function generateAnthropicQuiz<TGeneratedQuiz>(
  config: GenerateAnthropicQuizConfig<TGeneratedQuiz>
): Promise<QuizQuestion | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);

  try {
    for (const attempt of [0, 1]) {
      const promptText = config.buildPromptText({ retry: attempt > 0 });
      const result = await requestAnthropicContent(
        config.apiKey,
        promptText,
        config.schema,
        config.maxOutputTokens,
        controller
      );
      const debugMeta = extractAnthropicDebugMeta(result.responseJson);

      if (!result.ok) {
        console.warn(`[wAItwise] Anthropic ${config.label} request failed:`, {
          status: result.status,
          body: result.responseJson,
          debugMeta,
        });
        return null;
      }

      console.log(
        `[wAItwise] Anthropic ${config.label} tool payload${attempt > 0 ? ' (retry)' : ''}:`,
        result.toolInput
      );
      console.log(
        `[wAItwise] Anthropic ${config.label} response meta${attempt > 0 ? ' (retry)' : ''}:`,
        debugMeta
      );

      if (!result.toolInput) {
        if (attempt === 0) continue;
        return null;
      }

      const normalizedQuiz = config.normalizeQuiz(result.toolInput);
      console.log(
        `[wAItwise] Anthropic ${config.label} parsed quiz${attempt > 0 ? ' (retry)' : ''}:`,
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
    console.warn(`[wAItwise] Anthropic ${config.label} fetch failed:`, error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function generateRetrievalQuizWithAnthropic(
  params: GenerateRetrievalQuizWithAnthropicParams
): Promise<QuizQuestion | null> {
  return generateAnthropicQuiz<RetrievalGeneratedQuiz>({
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

export async function generateGeneralQuizWithAnthropic(
  params: GenerateGeneralQuizWithAnthropicParams
): Promise<QuizQuestion | null> {
  return generateAnthropicQuiz<GeneralGeneratedQuiz>({
    label: 'general',
    apiKey: params.apiKey,
    buildPromptText: (options) => buildGeneralPromptText(params, options),
    schema: GENERAL_SCHEMA,
    maxOutputTokens: GENERAL_MAX_OUTPUT_TOKENS,
    normalizeQuiz: normalizeGeneralGeneratedQuiz,
    buildQuestion: buildGeneralQuizQuestion,
  });
}

export async function generateMathQuizWithAnthropic(
  params: GenerateMathQuizWithAnthropicParams
): Promise<QuizQuestion | null> {
  return generateAnthropicQuiz<MathGeneratedQuiz>({
    label: 'math',
    apiKey: params.apiKey,
    buildPromptText: (options) => buildMathPromptText(params, options),
    schema: MATH_SCHEMA,
    maxOutputTokens: MATH_MAX_OUTPUT_TOKENS,
    normalizeQuiz: normalizeMathGeneratedQuiz,
    buildQuestion: buildMathQuizQuestion,
  });
}
