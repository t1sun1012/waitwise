import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { before } from 'node:test';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const outDir = path.join(repoRoot, '.tmp-gemini-provider-tests');

let buildGeminiPromptText;
let buildQuizQuestionFromGeminiOutput;
let extractGeminiDebugMeta;
let extractGeminiText;
let extractJsonPayload;
let normalizeGeminiGeneratedQuiz;

function compileGeminiProviderModules() {
  mkdirSync(outDir, { recursive: true });
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

  buildGeminiPromptText = providerModule.buildGeminiPromptText;
  buildQuizQuestionFromGeminiOutput =
    providerModule.buildQuizQuestionFromGeminiOutput;
  extractGeminiDebugMeta = providerModule.extractGeminiDebugMeta;
  extractGeminiText = providerModule.extractGeminiText;
  extractJsonPayload = providerModule.extractJsonPayload;
  normalizeGeminiGeneratedQuiz = providerModule.normalizeGeminiGeneratedQuiz;
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
      corpus: 'data_science_interview_questions_answers',
      category: 'python',
      subcategory: 'flask',
      title: 'Explain what Flask is and its benefits',
      question: 'Explain what Flask is and its benefits.',
      answer:
        'Flask is a web framework that provides tools, libraries, and technologies for building web applications.',
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

test('buildGeminiPromptText includes topic context and source ids', () => {
  const prompt = buildGeminiPromptText({
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

test('normalizeGeminiGeneratedQuiz accepts valid payloads', () => {
  const payload = normalizeGeminiGeneratedQuiz({
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

test('normalizeGeminiGeneratedQuiz rejects invalid option counts', () => {
  const payload = normalizeGeminiGeneratedQuiz({
    topic: 'python',
    question: 'What is Flask?',
    options: ['A framework', 'A DB', 'A package manager'],
    correctIndex: 0,
    explanation: 'Flask is a web framework.',
    sourceId: 'python_flask_benefits_q13',
  });

  assert.equal(payload, null);
});

test('buildQuizQuestionFromGeminiOutput resolves source metadata', () => {
  const rankedChunk = createRankedChunk();
  const question = buildQuizQuestionFromGeminiOutput(
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
  assert.equal(question.source.id, rankedChunk.chunk.id);
  assert.equal(question.source.title, rankedChunk.chunk.title);
  assert.equal(question.source.source.url, rankedChunk.chunk.source.url);
});
