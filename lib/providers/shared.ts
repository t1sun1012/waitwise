import type {
  QuizQuestion,
  QuizQuestionType,
  QuizSource,
} from '../../types/messages';
import type { ConversationContext, RankedRetrievedChunk } from '../../types/rag';

const MAX_SOURCE_CHUNKS = 1;
const MAX_PROMPT_CHARS = 140;
const MAX_GENERAL_PROMPT_CONTEXT_CHARS = 220;

export const GENERAL_QUESTION_TYPES: QuizQuestionType[] = [
  'concept_check',
  'application',
  'misconception',
  'category',
  'history',
];

const VAGUE_GENERAL_PROMPT_PATTERNS = [
  /^why[?.!]*$/i,
  /^how[?.!]*$/i,
  /^and[?.!]*$/i,
  /^what about[?.!]*$/i,
  /^more[?.!]*$/i,
  /^explain more[?.!]*$/i,
  /^tell me more[?.!]*$/i,
  /^go on[?.!]*$/i,
];

export interface StructuredSchema {
  name: string;
  propertyOrdering: string[];
  properties: Record<string, unknown>;
  required: string[];
}

export interface RetrievalGeneratedQuiz {
  topic: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  sourceId: string;
}

export interface GeneralGeneratedQuiz {
  mode: 'general';
  topic: string;
  questionType: QuizQuestionType;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface MathGeneratedQuiz {
  mode: 'math';
  topic: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface RetrievalPromptParams {
  retrievalContext?: ConversationContext;
  retrievedChunks: RankedRetrievedChunk[];
}

export interface GeneralPromptParams {
  currentPrompt: string;
  recentUserPrompts?: string[];
}

export interface MathPromptParams {
  currentPrompt?: string;
}

export const RETRIEVAL_SCHEMA: StructuredSchema = {
  name: 'waitwise_retrieval_quiz',
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
};

export const GENERAL_SCHEMA: StructuredSchema = {
  name: 'waitwise_general_quiz',
  propertyOrdering: [
    'mode',
    'topic',
    'questionType',
    'question',
    'options',
    'correctIndex',
    'explanation',
  ],
  properties: {
    mode: { type: 'string', enum: ['general'] },
    topic: { type: 'string' },
    questionType: {
      type: 'string',
      enum: GENERAL_QUESTION_TYPES,
    },
    question: { type: 'string' },
    options: {
      type: 'array',
      items: { type: 'string' },
      minItems: 4,
      maxItems: 4,
    },
    correctIndex: { type: 'integer' },
    explanation: { type: 'string' },
  },
  required: [
    'mode',
    'topic',
    'questionType',
    'question',
    'options',
    'correctIndex',
    'explanation',
  ],
};

export const MATH_SCHEMA: StructuredSchema = {
  name: 'waitwise_math_quiz',
  propertyOrdering: [
    'mode',
    'topic',
    'question',
    'options',
    'correctIndex',
    'explanation',
  ],
  properties: {
    mode: { type: 'string', enum: ['math'] },
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
  },
  required: [
    'mode',
    'topic',
    'question',
    'options',
    'correctIndex',
    'explanation',
  ],
};

export function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

export function clampPromptText(value: string, maxChars = MAX_PROMPT_CHARS): string {
  if (value.length <= maxChars) return value;

  const sliced = value.slice(0, maxChars).trimEnd();
  const lastSpace = sliced.lastIndexOf(' ');
  if (lastSpace <= Math.floor(maxChars * 0.6)) {
    return `${sliced}...`;
  }

  return `${sliced.slice(0, lastSpace)}...`;
}

function buildSourceSummary(retrievedChunks: RankedRetrievedChunk[]): string {
  return JSON.stringify({
    chunks: retrievedChunks.slice(0, MAX_SOURCE_CHUNKS).map((result) => ({
      sourceId: result.chunk.id,
      category: result.chunk.category,
      subcategory: result.chunk.subcategory ?? null,
      chunkType: result.chunk.chunkType ?? 'topic',
      createdAt: result.chunk.createdAt ?? null,
      title: result.chunk.title,
      topicSummary: clampPromptText(result.chunk.topicSummary),
      promptHint: clampPromptText(result.chunk.promptHint),
      tags: result.chunk.tags.slice(0, 4),
      keywords: result.chunk.keywords.slice(0, 8),
    })),
  });
}

export function buildRetrievalPromptText(
  params: RetrievalPromptParams,
  options?: { retry?: boolean }
): string {
  const summary = clampPromptText(
    normalizeText(params.retrievalContext?.summary)
  );
  const intent = normalizeText(params.retrievalContext?.intent);
  const entities = params.retrievalContext?.entities.slice(0, 4).join(', ') ?? '';
  const relatedConcepts =
    params.retrievalContext?.relatedConcepts.slice(0, 4).join(', ') ?? '';
  const retrievalQueries =
    params.retrievalContext?.retrievalQueries.slice(0, 3).join(' | ') ?? '';
  const sourceTitle = clampPromptText(
    normalizeText(params.retrievedChunks[0]?.chunk.title)
  );
  const isRetry = options?.retry === true;

  return [
    'Generate one grounded technical interview multiple-choice quiz for WaitWise.',
    'Use retrieved topic chunks as source evidence.',
    'Use title, tags, keywords, and topicSummary as the topic anchor.',
    'Write a conceptual quiz about the topic, not about the source metadata text.',
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
  ]
    .filter(Boolean)
    .join('\n');
}

function isVagueGeneralPrompt(prompt: string): boolean {
  const normalized = normalizeText(prompt).toLowerCase();
  if (!normalized) return true;
  if (VAGUE_GENERAL_PROMPT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  return normalized.split(' ').length <= 3 && normalized.length <= 18;
}

function buildGeneralPromptContext(
  currentPrompt: string,
  recentUserPrompts: string[] = []
): {
  anchorPrompt: string;
  disambiguationPrompts: string[];
} {
  const normalizedCurrentPrompt = normalizeText(currentPrompt);
  const normalizedRecentUserPrompts = recentUserPrompts
    .map((prompt) => normalizeText(prompt))
    .filter(Boolean)
    .slice(0, 3);

  if (!isVagueGeneralPrompt(normalizedCurrentPrompt)) {
    return {
      anchorPrompt: normalizedCurrentPrompt,
      disambiguationPrompts: [],
    };
  }

  return {
    anchorPrompt: normalizedCurrentPrompt || normalizedRecentUserPrompts[0] || '',
    disambiguationPrompts: normalizedRecentUserPrompts,
  };
}

export function buildGeneralPromptText(
  params: GeneralPromptParams,
  options?: { retry?: boolean }
): string {
  const promptContext = buildGeneralPromptContext(
    params.currentPrompt,
    params.recentUserPrompts
  );
  const isRetry = options?.retry === true;
  const disambiguationContext = promptContext.disambiguationPrompts
    .map(
      (prompt, index) =>
        `${index + 1}. ${clampPromptText(prompt, MAX_GENERAL_PROMPT_CONTEXT_CHARS)}`
    )
    .join('\n');

  return [
    'You are generating one short multiple-choice "thinking extension" quiz for a general ChatGPT user.',
    '',
    'Goal:',
    'Help the user think a little further about the topic in their prompt while ChatGPT is generating.',
    '',
    `Input prompt: ${clampPromptText(promptContext.anchorPrompt, MAX_GENERAL_PROMPT_CONTEXT_CHARS) || '(empty)'}`,
    promptContext.disambiguationPrompts.length > 0
      ? `Recent user context for disambiguation:\n${disambiguationContext}`
      : '',
    '',
    'Instructions:',
    '1. Use the user\'s prompt as the main anchor.',
    '2. Identify the central topic and the most important idea in the prompt.',
    '3. Create exactly one multiple-choice question that extends the user\'s thinking.',
    '4. Prefer one of these question styles: concept check, practical application, common misconception, or a broader related idea.',
    '5. You may use an adjacent related idea if it is a natural extension of the prompt.',
    '6. Keep the question at general-knowledge difficulty unless the prompt is clearly technical.',
    '7. Provide exactly 4 answer options.',
    '8. Include exactly 1 correct answer and 3 plausible distractors.',
    '9. Keep the quiz reasonably close to the user\'s topic.',
    '10. If the prompt is too vague for a direct concept question, first prefer a category-level question.',
    '11. Use a history-style question only as a last resort.',
    '12. Write a short explanation for why the correct answer is right.',
    '13. Return valid JSON only. Do not include markdown, code fences, or any extra text.',
    isRetry
      ? '14. Previous response was invalid. Return exactly one minified JSON object with no extra text.'
      : '',
    '',
    'Return this exact JSON shape:',
    '{"mode":"general","topic":"string","questionType":"concept_check","question":"string","options":["a","b","c","d"],"correctIndex":0,"explanation":"string"}',
    'Rules:',
    '- "mode" must always be "general".',
    '- "questionType" must be one of: concept_check, application, misconception, category, history.',
    '- "options" must contain exactly 4 strings.',
    '- "correctIndex" must be an integer from 0 to 3.',
    '- Keep the wording concise and natural.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildMathPromptText(
  params: MathPromptParams = {},
  options?: { retry?: boolean }
): string {
  const currentPrompt = normalizeText(params.currentPrompt);
  const isRetry = options?.retry === true;

  return [
    'Generate one short arithmetic multiple-choice quiz for WaitWise.',
    'This is for a user waiting on ChatGPT, so the quiz should be simple, fast, and self-contained.',
    'Return raw JSON only.',
    'No markdown. No prose. No prefix or suffix.',
    'Use arithmetic only: addition, subtraction, multiplication, or division with whole-number answers.',
    currentPrompt ? `Optional user context: ${clampPromptText(currentPrompt, MAX_GENERAL_PROMPT_CONTEXT_CHARS)}` : '',
    isRetry
      ? 'Previous response was invalid. Return one minified JSON object only.'
      : '',
    '',
    'Return this exact JSON shape:',
    '{"mode":"math","topic":"arithmetic","question":"string","options":["a","b","c","d"],"correctIndex":0,"explanation":"string"}',
    'Rules:',
    '- "mode" must always be "math".',
    '- "topic" should be "arithmetic" unless a more specific arithmetic label is helpful.',
    '- "question" should be a single arithmetic expression or short word problem.',
    '- "options" must contain exactly 4 strings.',
    '- "correctIndex" must be an integer from 0 to 3.',
    '- Keep the explanation short and directly about the arithmetic.',
  ]
    .filter(Boolean)
    .join('\n');
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

export function buildStructuredOutputSchema(schema: StructuredSchema): Record<string, unknown> {
  return {
    type: 'object',
    properties: schema.properties,
    required: schema.required,
    additionalProperties: false,
  };
}

export function normalizeRetrievalGeneratedQuiz(
  payload: unknown
): RetrievalGeneratedQuiz | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as Partial<RetrievalGeneratedQuiz>;

  if (
    typeof candidate.topic !== 'string' ||
    typeof candidate.question !== 'string' ||
    !Array.isArray(candidate.options) ||
    candidate.options.length !== 4 ||
    candidate.options.some((option) => typeof option !== 'string') ||
    typeof candidate.correctIndex !== 'number' ||
    !Number.isInteger(candidate.correctIndex) ||
    candidate.correctIndex < 0 ||
    candidate.correctIndex >= candidate.options.length ||
    typeof candidate.explanation !== 'string' ||
    typeof candidate.sourceId !== 'string'
  ) {
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

  if (
    !normalized.topic ||
    !normalized.question ||
    !normalized.explanation ||
    !normalized.sourceId ||
    normalized.options.some((option) => option.length === 0)
  ) {
    return null;
  }

  return normalized;
}

export function normalizeGeneralGeneratedQuiz(
  payload: unknown
): GeneralGeneratedQuiz | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as Partial<GeneralGeneratedQuiz>;

  if (
    candidate.mode !== 'general' ||
    typeof candidate.topic !== 'string' ||
    typeof candidate.questionType !== 'string' ||
    !GENERAL_QUESTION_TYPES.includes(candidate.questionType as QuizQuestionType) ||
    typeof candidate.question !== 'string' ||
    !Array.isArray(candidate.options) ||
    candidate.options.length !== 4 ||
    candidate.options.some((option) => typeof option !== 'string') ||
    typeof candidate.correctIndex !== 'number' ||
    !Number.isInteger(candidate.correctIndex) ||
    candidate.correctIndex < 0 ||
    candidate.correctIndex >= candidate.options.length ||
    typeof candidate.explanation !== 'string'
  ) {
    return null;
  }

  const normalized = {
    mode: 'general' as const,
    topic: candidate.topic.trim(),
    questionType: candidate.questionType as QuizQuestionType,
    question: candidate.question.trim(),
    options: candidate.options.map((option) => option.trim()),
    correctIndex: candidate.correctIndex,
    explanation: candidate.explanation.trim(),
  };

  if (
    !normalized.topic ||
    !normalized.question ||
    !normalized.explanation ||
    normalized.options.some((option) => option.length === 0)
  ) {
    return null;
  }

  return normalized;
}

export function normalizeMathGeneratedQuiz(
  payload: unknown
): MathGeneratedQuiz | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as Partial<MathGeneratedQuiz>;

  if (
    candidate.mode !== 'math' ||
    typeof candidate.topic !== 'string' ||
    typeof candidate.question !== 'string' ||
    !Array.isArray(candidate.options) ||
    candidate.options.length !== 4 ||
    candidate.options.some((option) => typeof option !== 'string') ||
    typeof candidate.correctIndex !== 'number' ||
    !Number.isInteger(candidate.correctIndex) ||
    candidate.correctIndex < 0 ||
    candidate.correctIndex >= candidate.options.length ||
    typeof candidate.explanation !== 'string'
  ) {
    return null;
  }

  const normalized = {
    mode: 'math' as const,
    topic: candidate.topic.trim(),
    question: candidate.question.trim(),
    options: candidate.options.map((option) => option.trim()),
    correctIndex: candidate.correctIndex,
    explanation: candidate.explanation.trim(),
  };

  if (
    !normalized.topic ||
    !normalized.question ||
    !normalized.explanation ||
    normalized.options.some((option) => option.length === 0)
  ) {
    return null;
  }

  return normalized;
}

function buildQuizSource(chunk: RankedRetrievedChunk['chunk']): QuizSource {
  return {
    id: chunk.id,
    corpus: chunk.corpus,
    category: chunk.category,
    subcategory: chunk.subcategory,
    chunkType: chunk.chunkType,
    createdAt: chunk.createdAt,
    title: chunk.title,
    promptHint: chunk.promptHint,
    topicSummary: chunk.topicSummary,
    tags: [...chunk.tags],
    source: { ...chunk.source },
  };
}

export function buildRetrievalQuizQuestion(
  generatedQuiz: RetrievalGeneratedQuiz,
  retrievedChunks: RankedRetrievedChunk[]
): QuizQuestion | null {
  const matchedChunk = retrievedChunks.find(
    (result) => result.chunk.id === generatedQuiz.sourceId
  )?.chunk;
  if (!matchedChunk) return null;

  return {
    id: `quiz-${generatedQuiz.sourceId}-${Date.now()}`,
    question: generatedQuiz.question,
    options: [...generatedQuiz.options],
    correctIndex: generatedQuiz.correctIndex,
    mode: 'retrieval',
    topic: generatedQuiz.topic,
    explanation: generatedQuiz.explanation,
    source: buildQuizSource(matchedChunk),
  };
}

export function buildGeneralQuizQuestion(
  generatedQuiz: GeneralGeneratedQuiz
): QuizQuestion {
  return {
    id: `quiz-general-${Date.now()}`,
    question: generatedQuiz.question,
    options: [...generatedQuiz.options],
    correctIndex: generatedQuiz.correctIndex,
    mode: 'general',
    topic: generatedQuiz.topic,
    questionType: generatedQuiz.questionType,
    explanation: generatedQuiz.explanation,
  };
}

export function buildMathQuizQuestion(
  generatedQuiz: MathGeneratedQuiz
): QuizQuestion {
  return {
    id: `quiz-math-${Date.now()}`,
    question: generatedQuiz.question,
    options: [...generatedQuiz.options],
    correctIndex: generatedQuiz.correctIndex,
    mode: 'math',
    topic: generatedQuiz.topic,
    explanation: generatedQuiz.explanation,
  };
}
