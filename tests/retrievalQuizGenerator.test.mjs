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
const outDir = path.join(repoRoot, '.tmp-retrieval-generator-tests');

let getRagCorpus;
let retrievalQuizGenerator;

function compileRetrievalGeneratorModules() {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, 'package.json'),
    JSON.stringify({ type: 'commonjs' }, null, 2)
  );

  const program = ts.createProgram(
    [
      path.join(repoRoot, 'types/messages.ts'),
      path.join(repoRoot, 'types/rag.ts'),
      path.join(repoRoot, 'lib/rag/corpus.ts'),
      path.join(repoRoot, 'quiz/retrievalGenerator.ts'),
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

    throw new Error(`Retrieval generator compilation failed:\n${message}`);
  }

  const corpusModule = require(path.join(outDir, 'lib/rag/corpus.js'));
  const generatorModule = require(
    path.join(outDir, 'quiz/retrievalGenerator.js')
  );

  getRagCorpus = corpusModule.getRagCorpus;
  retrievalQuizGenerator = generatorModule.retrievalQuizGenerator;
}

before(() => {
  compileRetrievalGeneratorModules();
});

test('builds a retrieval-backed quiz from the top ranked chunk', () => {
  const [logisticRegressionChunk] = getRagCorpus().filter(
    (chunk) => chunk.id === 'logistic-regression-b0505317b53782db9c9001fe8426a708'
  );
  const [mseChunk] = getRagCorpus().filter(
    (chunk) => chunk.id === 'why-mse-doesnt-work-with-logistic-regression-10205317b53783c0b0f0018e51ab456f'
  );

  const question = retrievalQuizGenerator.generate([
    { chunk: logisticRegressionChunk, score: 12, signals: [] },
    { chunk: mseChunk, score: 4, signals: [] },
  ]);

  assert.ok(question);
  assert.match(question.question, /logistic regression/i);
  assert.equal(question.options.length, 4);
  assert.ok(question.correctIndex >= 0 && question.correctIndex < question.options.length);
  assert.match(question.options[question.correctIndex], /classification|probability|sigmoid/i);
  assert.equal(question.mode, 'retrieval');
  assert.equal(question.source.id, logisticRegressionChunk.id);
  assert.equal(question.source.title, logisticRegressionChunk.title);
  assert.equal(question.source.answer, logisticRegressionChunk.answer);
  assert.equal(question.source.source.repo, logisticRegressionChunk.source.repo);
  assert.equal(question.explanation, logisticRegressionChunk.answer);
});

test('falls back to a random RAG question when there is no retrieved chunk', () => {
  const question = retrievalQuizGenerator.generate([]);

  assert.ok(question);
  assert.equal(question.mode, 'retrieval');
  assert.equal(question.options.length, 4);
  assert.match(question.contextNote, /no appropriate related question found/i);
  assert.ok(question.source?.title);
  assert.ok(question.source?.answer);
});

test('falls back to a random RAG question when the top retrieval result is not confident enough', () => {
  const [logisticRegressionChunk] = getRagCorpus().filter(
    (chunk) => chunk.id === 'logistic-regression-b0505317b53782db9c9001fe8426a708'
  );
  const [mseChunk] = getRagCorpus().filter(
    (chunk) => chunk.id === 'why-mse-doesnt-work-with-logistic-regression-10205317b53783c0b0f0018e51ab456f'
  );

  const question = retrievalQuizGenerator.generate([
    { chunk: logisticRegressionChunk, score: 11, signals: [] },
    { chunk: mseChunk, score: 8, signals: [] },
  ]);

  assert.ok(question);
  assert.equal(question.mode, 'retrieval');
  assert.equal(question.options.length, 4);
  assert.match(question.contextNote, /no appropriate related question found/i);
  assert.ok(question.source?.source.url);
});

test('avoids recently used source ids in random fallback when alternatives exist', () => {
  const corpus = getRagCorpus();
  const keptChunk = corpus[0];
  const excludedIds = corpus.slice(1).map((chunk) => chunk.id);

  const question = retrievalQuizGenerator.generate([], {
    recentSourceIds: excludedIds,
  });

  assert.ok(question);
  assert.equal(question.source?.id, keptChunk.id);
});
