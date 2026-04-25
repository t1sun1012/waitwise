import assert from 'node:assert/strict';
import os from 'node:os';
import { mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { before } from 'node:test';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const outDir = mkdtempSync(
  path.join(os.tmpdir(), 'waitwise-gemini-provider-tests-')
);

let buildGeneralGeminiPromptText;
let buildGeneralQuizQuestionFromGeminiOutput;
let buildRetrievalGeminiPromptText;
let buildRetrievalQuizQuestionFromGeminiOutput;
let extractGeminiDebugMeta;
let extractGeminiText;
let extractJsonPayload;
let normalizeGeneralGeminiGeneratedQuiz;
let normalizeRetrievalGeminiGeneratedQuiz;

function compileGeminiProviderModules() {
  writeFileSync(
    path.join(outDir, 'package.json'),
    JSON.stringify({ type: 'commonjs' }, null, 2)
  );

  const program = ts.createProgram(
    [
      path.join(repoRoot, 'types/messages.ts'),
      path.join(repoRoot, 'types/rag.ts'),
      path.join(repoRoot, 'lib/providers/gemini.ts'),
    ],
    {
      rootDir: repoRoot,
      outDir,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      esModuleInterop: true,
      skipLibCheck: true,
      strict: true,
    }
  );

  const result = program.emit();
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(result.diagnostics);

  if (diagnostics.length > 0) {
    const message = diagnostics
      .map((diagnostic) => {
        const text = ts.flattenDiagnosticMessageText(
          diagnostic.messageText,
          '\n'
        );

        if (!diagnostic.file || typeof diagnostic.start !== 'number') {
          return text;
        }

        const { line, character } =
          diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
        return `${diagnostic.file.fileName}:${line + 1}:${character + 1} ${text}`;
      })
      .join('\n');

    throw new Error(`Gemini provider compilation failed:\n${message}`);
  }

  const providerModule = require(path.join(outDir, 'lib/providers/gemini.js'));

  buildGeneralGeminiPromptText = providerModule.buildGeneralGeminiPromptText;
  buildGeneralQuizQuestionFromGeminiOutput =
    providerModule.buildGeneralQuizQuestionFromGeminiOutput;
  buildRetrievalGeminiPromptText =
    providerModule.buildRetrievalGeminiPromptText;
  buildRetrievalQuizQuestionFromGeminiOutput =
    providerModule.buildRetrievalQuizQuestionFromGeminiOutput;
  extractGeminiDebugMeta = providerModule.extractGeminiDebugMeta;
  extractGeminiText = providerModule.extractGeminiText;
  extractJsonPayload = providerModule.extractJsonPayload;
  normalizeGeneralGeminiGeneratedQuiz =
    providerModule.normalizeGeneralGeminiGeneratedQuiz;
  normalizeRetrievalGeminiGeneratedQuiz =
    providerModule.normalizeRetrievalGeminiGeneratedQuiz;
}

before(() => {
  compileGeminiProviderModules();
});

function createRankedChunk(id = 'python_flask_benefits_q13') {
  return {
    score: 19,
    signals: [],
    chunk: {
      id,
      corpus: 'notion_technical_interview',
      category: 'python',
      subcategory: 'flask',
      chunkType: 'topic',
      createdAt: '2024-02-17',
      title: 'Explain what Flask is and its benefits',
      promptHint: 'Generate a technical interview quiz about Flask.',
      topicSummary:
        'Topic index entry for Flask under Python. Open the source database for the original Notion notes.',
      tags: ['python', 'flask', 'framework'],
      keywords: ['flask', 'web framework'],
      text: 'Flask is a lightweight Python microframework.',
      source: {
        repo: 'youssefHosni/Data-Science-Interview-Questions-Answers',
        path: 'Python Interview Questions & Answers for Data Scientists.md',
        url: 'https://github.com/example/repo#q13',
      },
    },
  };
}

test('buildRetrievalGeminiPromptText includes topic context and source ids', () => {
  const prompt = buildRetrievalGeminiPromptText({
    retrievalContext: {
      currentUserPrompt: 'what is flask?',
      previousUserPrompts: [],
      recentAssistantReplies: [],
      intent: 'define',
      entities: ['flask', 'web framework'],
      relatedConcepts: ['python'],
      summary: 'define flask; related concepts: python',
      retrievalQueries: ['flask web framework python'],
    },
    retrievedChunks: [createRankedChunk()],
  });

  assert.match(prompt, /Context summary: define flask/i);
  assert.match(prompt, /Intent: define/i);
  assert.match(prompt, /Key entities: flask, web framework/i);
  assert.match(prompt, /Related concepts: python/i);
  assert.match(prompt, /python_flask_benefits_q13/);
  assert.match(prompt, /Return raw JSON only/i);
  assert.match(prompt, /Question under 14 words/i);
});

test('buildGeneralGeminiPromptText stays anchored to the current prompt', () => {
  const prompt = buildGeneralGeminiPromptText({
    currentPrompt: 'Why do eclipses happen?',
    recentUserPrompts: ['Explain tides simply.'],
  });

  assert.match(prompt, /Input prompt: Why do eclipses happen\?/i);
  assert.doesNotMatch(prompt, /Recent user context for disambiguation/i);
  assert.match(prompt, /"mode":"general"/i);
  assert.match(prompt, /questionType/i);
});

test('buildGeneralGeminiPromptText uses recent user prompts only for vague follow-ups', () => {
  const prompt = buildGeneralGeminiPromptText({
    currentPrompt: 'Why?',
    recentUserPrompts: [
      'What is photosynthesis?',
      'Why do plants need sunlight?',
    ],
  });

  assert.match(prompt, /Input prompt: Why\?/i);
  assert.match(prompt, /Recent user context for disambiguation:/i);
  assert.match(prompt, /What is photosynthesis\?/i);
  assert.match(prompt, /Why do plants need sunlight\?/i);
});

test('extractGeminiText returns the first text part', () => {
  const text = extractGeminiText({
    candidates: [
      {
        content: {
          parts: [{ text: '{"topic":"python"}' }],
        },
      },
    ],
  });

  assert.equal(text, '{"topic":"python"}');
});

test('extractGeminiDebugMeta returns finish reason and token counts', () => {
  const meta = extractGeminiDebugMeta({
    candidates: [{ finishReason: 'STOP' }],
    usageMetadata: {
      promptTokenCount: 321,
      candidatesTokenCount: 91,
    },
  });

  assert.deepEqual(meta, {
    finishReason: 'STOP',
    promptTokenCount: 321,
    candidatesTokenCount: 91,
  });
});

test('normalizeRetrievalGeminiGeneratedQuiz accepts valid payloads', () => {
  const payload = normalizeRetrievalGeminiGeneratedQuiz({
    topic: ' python ',
    question: ' What is Flask? ',
    options: [' A framework ', 'A DB', 'A package manager', 'A shell'],
    correctIndex: 0,
    explanation: ' Flask is a web framework. ',
    sourceId: ' python_flask_benefits_q13 ',
  });

  assert.deepEqual(payload, {
    topic: 'python',
    question: 'What is Flask?',
    options: ['A framework', 'A DB', 'A package manager', 'A shell'],
    correctIndex: 0,
    explanation: 'Flask is a web framework.',
    sourceId: 'python_flask_benefits_q13',
  });
});

test('normalizeGeneralGeminiGeneratedQuiz accepts valid payloads', () => {
  const payload = normalizeGeneralGeminiGeneratedQuiz({
    mode: 'general',
    topic: ' astronomy ',
    questionType: 'concept_check',
    question: ' Why do eclipses happen? ',
    options: ['Orbital alignment', 'Cloud cover', 'Air pressure', 'Magnetism'],
    correctIndex: 0,
    explanation: ' Eclipses happen when celestial bodies align. ',
  });

  assert.deepEqual(payload, {
    mode: 'general',
    topic: 'astronomy',
    questionType: 'concept_check',
    question: 'Why do eclipses happen?',
    options: ['Orbital alignment', 'Cloud cover', 'Air pressure', 'Magnetism'],
    correctIndex: 0,
    explanation: 'Eclipses happen when celestial bodies align.',
  });
});

test('extractJsonPayload strips leading prose before a JSON object', () => {
  const payload = extractJsonPayload(
    'Here is the JSON requested:\n{"topic":"python","question":"Q?","options":["a","b","c","d"],"correctIndex":0,"explanation":"Because.","sourceId":"python_flask_benefits_q13"}'
  );

  assert.equal(
    payload,
    '{"topic":"python","question":"Q?","options":["a","b","c","d"],"correctIndex":0,"explanation":"Because.","sourceId":"python_flask_benefits_q13"}'
  );
});

test('extractJsonPayload unwraps fenced JSON blocks', () => {
  const payload = extractJsonPayload(
    '```json\n{"topic":"python","question":"Q?","options":["a","b","c","d"],"correctIndex":0,"explanation":"Because.","sourceId":"python_flask_benefits_q13"}\n```'
  );

  assert.equal(
    payload,
    '{"topic":"python","question":"Q?","options":["a","b","c","d"],"correctIndex":0,"explanation":"Because.","sourceId":"python_flask_benefits_q13"}'
  );
});

test('normalizeRetrievalGeminiGeneratedQuiz rejects invalid option counts', () => {
  const payload = normalizeRetrievalGeminiGeneratedQuiz({
    topic: 'python',
    question: 'What is Flask?',
    options: ['A framework', 'A DB', 'A package manager'],
    correctIndex: 0,
    explanation: 'Flask is a web framework.',
    sourceId: 'python_flask_benefits_q13',
  });

  assert.equal(payload, null);
});

test('normalizeGeneralGeminiGeneratedQuiz rejects invalid question types', () => {
  const payload = normalizeGeneralGeminiGeneratedQuiz({
    mode: 'general',
    topic: 'astronomy',
    questionType: 'trivia',
    question: 'Why do eclipses happen?',
    options: ['Orbital alignment', 'Cloud cover', 'Air pressure', 'Magnetism'],
    correctIndex: 0,
    explanation: 'Because they align.',
  });

  assert.equal(payload, null);
});

test('buildRetrievalQuizQuestionFromGeminiOutput resolves source metadata', () => {
  const rankedChunk = createRankedChunk();
  const question = buildRetrievalQuizQuestionFromGeminiOutput(
    {
      topic: 'python',
      question: 'Which statement best describes Flask?',
      options: ['A web framework', 'A database', 'A shell', 'A package manager'],
      correctIndex: 0,
      explanation: 'Flask is a web framework.',
      sourceId: rankedChunk.chunk.id,
    },
    [rankedChunk]
  );

  assert.ok(question);
  assert.equal(question.mode, 'retrieval');
  assert.equal(question.topic, 'python');
  assert.equal(question.source.id, rankedChunk.chunk.id);
  assert.equal(question.source.title, rankedChunk.chunk.title);
  assert.equal(question.source.source.url, rankedChunk.chunk.source.url);
});

test('buildGeneralQuizQuestionFromGeminiOutput creates a source-free general question', () => {
  const question = buildGeneralQuizQuestionFromGeminiOutput({
    mode: 'general',
    topic: 'astronomy',
    questionType: 'concept_check',
    question: 'Why do eclipses happen?',
    options: ['Orbital alignment', 'Cloud cover', 'Air pressure', 'Magnetism'],
    correctIndex: 0,
    explanation: 'Eclipses happen when celestial bodies align.',
  });

  assert.equal(question.mode, 'general');
  assert.equal(question.topic, 'astronomy');
  assert.equal(question.questionType, 'concept_check');
  assert.equal(question.source, undefined);
});
