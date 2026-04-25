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
  path.join(os.tmpdir(), 'waitwise-quiz-mode-router-tests-')
);

let getRagCorpus;
let resolveQuizForMode;

function compileQuizModeRouterModules() {
  writeFileSync(
    path.join(outDir, 'package.json'),
    JSON.stringify({ type: 'commonjs' }, null, 2)
  );

  const program = ts.createProgram(
    [
      path.join(repoRoot, 'types/messages.ts'),
      path.join(repoRoot, 'types/rag.ts'),
      path.join(repoRoot, 'lib/rag/corpus.ts'),
      path.join(repoRoot, 'quiz/mathGenerator.ts'),
      path.join(repoRoot, 'quiz/retrievalGenerator.ts'),
      path.join(repoRoot, 'lib/providers/shared.ts'),
      path.join(repoRoot, 'lib/providers/gemini.ts'),
      path.join(repoRoot, 'lib/providers/openai.ts'),
      path.join(repoRoot, 'lib/providers/anthropic.ts'),
      path.join(repoRoot, 'lib/providers/index.ts'),
      path.join(repoRoot, 'lib/quizModeRouter.ts'),
    ],
    {
      rootDir: repoRoot,
      outDir,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      esModuleInterop: true,
      resolveJsonModule: true,
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

    throw new Error(`Quiz mode router compilation failed:\n${message}`);
  }

  const corpusModule = require(path.join(outDir, 'lib/rag/corpus.js'));
  const routerModule = require(path.join(outDir, 'lib/quizModeRouter.js'));

  getRagCorpus = corpusModule.getRagCorpus;
  resolveQuizForMode = routerModule.resolveQuizForMode;
}

before(() => {
  compileQuizModeRouterModules();
});

function buildRetrievedChunks() {
  const corpus = getRagCorpus();
  const logisticRegressionChunk = corpus.find(
    (chunk) => chunk.id === 'logistic-regression-b0505317b53782db9c9001fe8426a708'
  );
  const mseChunk = corpus.find(
    (chunk) => chunk.id === 'why-mse-doesnt-work-with-logistic-regression-10205317b53783c0b0f0018e51ab456f'
  );

  return [
    { chunk: logisticRegressionChunk, score: 20, signals: [] },
    { chunk: mseChunk, score: 8, signals: [] },
  ];
}

test('general mode uses the selected provider when a key is present and generation succeeds', async () => {
  let observedProvider = null;

  const result = await resolveQuizForMode(
    {
      quizMode: 'general',
      quizProvider: 'openai',
      providerApiKey: 'test-key',
      retrievedChunks: [],
      currentPrompt: 'Why do eclipses happen?',
    },
    {
      generateGeneralQuiz: async (params) => {
        observedProvider = params.provider;
        return {
          id: 'general-1',
          question: 'Why do eclipses happen?',
          options: ['Orbital alignment', 'Cloud cover', 'Air pressure', 'Magnetism'],
          correctIndex: 0,
          mode: 'general',
          topic: 'astronomy',
          questionType: 'concept_check',
          explanation: 'Eclipses happen when celestial bodies align.',
        };
      },
    }
  );

  assert.equal(observedProvider, 'openai');
  assert.equal(result.fallbackReason, undefined);
  assert.equal(result.question.mode, 'general');
  assert.equal(result.question.topic, 'astronomy');
});

test('general mode falls back to math when no provider key is set', async () => {
  const result = await resolveQuizForMode({
    quizMode: 'general',
    quizProvider: 'anthropic',
    providerApiKey: '',
    retrievedChunks: [],
    currentPrompt: 'What is photosynthesis?',
  });

  assert.equal(result.fallbackReason, 'general-missing-api-key');
  assert.equal(result.question.mode, 'math');
});

test('general mode falls back to math when provider generation fails', async () => {
  const result = await resolveQuizForMode(
    {
      quizMode: 'general',
      quizProvider: 'gemini',
      providerApiKey: 'test-key',
      retrievedChunks: [],
      currentPrompt: 'What is photosynthesis?',
    },
    {
      generateGeneralQuiz: async () => null,
    }
  );

  assert.equal(result.fallbackReason, 'general-provider-failed');
  assert.equal(result.question.mode, 'math');
});

test('retrieval mode still returns retrieval quizzes when provider generation succeeds', async () => {
  const retrievedChunks = buildRetrievedChunks();
  let observedProvider = null;

  const result = await resolveQuizForMode(
    {
      quizMode: 'retrieval',
      quizProvider: 'anthropic',
      providerApiKey: 'test-key',
      retrievedChunks,
      retrievalContext: {
        currentUserPrompt: 'What is logistic regression?',
        previousUserPrompts: [],
        recentAssistantReplies: [],
        intent: 'define',
        entities: ['logistic regression'],
        relatedConcepts: ['classification', 'sigmoid'],
        summary: 'define logistic regression',
        retrievalQueries: ['logistic regression sigmoid classification'],
      },
    },
    {
      generateRetrievalQuiz: async (params) => {
        observedProvider = params.provider;
        return {
          id: 'retrieval-1',
          question: 'What is logistic regression?',
          options: ['A classifier', 'A database', 'A shell', 'A package manager'],
          correctIndex: 0,
          mode: 'retrieval',
          topic: 'machine learning',
          explanation: 'Logistic regression models class probabilities.',
          source: {
            ...retrievedChunks[0].chunk,
            tags: [...retrievedChunks[0].chunk.tags],
            source: { ...retrievedChunks[0].chunk.source },
          },
        };
      },
    }
  );

  assert.equal(observedProvider, 'anthropic');
  assert.equal(result.fallbackReason, undefined);
  assert.equal(result.question.mode, 'retrieval');
});

test('retrieval mode uses provider generation with a random topic when retrieval is weak', async () => {
  const corpus = getRagCorpus();
  const keptChunk = corpus[0];
  const excludedIds = corpus.slice(1).map((chunk) => chunk.id);
  let observedChunkId = null;

  const result = await resolveQuizForMode(
    {
      quizMode: 'retrieval',
      quizProvider: 'gemini',
      providerApiKey: 'test-key',
      retrievedChunks: [],
      recentSourceIds: excludedIds,
      retrievalContext: {
        currentUserPrompt: 'zzzxqv unrelated gibberish',
        previousUserPrompts: [],
        recentAssistantReplies: [],
        intent: 'generic',
        entities: [],
        relatedConcepts: [],
        summary: 'unrelated gibberish',
        retrievalQueries: ['zzzxqv unrelated gibberish'],
      },
    },
    {
      generateRetrievalQuiz: async (params) => {
        observedChunkId = params.retrievedChunks[0]?.chunk.id ?? null;
        return {
          id: 'retrieval-random-1',
          question: 'What is this topic about?',
          options: ['A topic', 'A database', 'A browser', 'A shell'],
          correctIndex: 0,
          mode: 'retrieval',
          topic: params.retrievedChunks[0]?.chunk.title,
          explanation: 'Generated from a random corpus topic.',
          source: {
            ...params.retrievedChunks[0].chunk,
            tags: [...params.retrievedChunks[0].chunk.tags],
            source: { ...params.retrievedChunks[0].chunk.source },
          },
        };
      },
    }
  );

  assert.equal(observedChunkId, keptChunk.id);
  assert.equal(result.fallbackReason, 'retrieval-random-topic');
  assert.equal(result.question.mode, 'retrieval');
});

test('math mode uses provider generation when a key is present', async () => {
  let observedProvider = null;

  const result = await resolveQuizForMode(
    {
      quizMode: 'math',
      quizProvider: 'gemini',
      providerApiKey: 'test-key',
      retrievedChunks: [],
      currentPrompt: 'Give me a quick mental math challenge',
    },
    {
      generateMathQuiz: async (params) => {
        observedProvider = params.provider;
        return {
          id: 'math-1',
          question: '12 + 15 = ?',
          options: ['27', '26', '28', '25'],
          correctIndex: 0,
          mode: 'math',
          topic: 'arithmetic',
          explanation: '12 plus 15 equals 27.',
        };
      },
    }
  );

  assert.equal(observedProvider, 'gemini');
  assert.equal(result.fallbackReason, undefined);
  assert.equal(result.question.mode, 'math');
  assert.equal(result.question.question, '12 + 15 = ?');
});

test('math mode falls back to local math when provider generation fails', async () => {
  const result = await resolveQuizForMode(
    {
      quizMode: 'math',
      quizProvider: 'openai',
      providerApiKey: 'test-key',
      retrievedChunks: [],
    },
    {
      generateMathQuiz: async () => null,
    }
  );

  assert.equal(result.fallbackReason, 'math-provider-failed');
  assert.equal(result.question.mode, 'math');
});
