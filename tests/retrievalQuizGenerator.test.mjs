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
  const [flaskChunk] = getRagCorpus().filter(
    (chunk) => chunk.id === 'python_flask_benefits_q13'
  );
  const [listsChunk] = getRagCorpus().filter(
    (chunk) => chunk.id === 'python_lists_vs_tuples_q5'
  );

  const question = retrievalQuizGenerator.generate([
    { chunk: flaskChunk, score: 12, signals: [] },
    { chunk: listsChunk, score: 4, signals: [] },
  ]);

  assert.ok(question);
  assert.match(question.question, /flask/i);
  assert.equal(question.options.length, 4);
  assert.ok(question.correctIndex >= 0 && question.correctIndex < question.options.length);
  assert.match(question.options[question.correctIndex], /web framework|microframework/i);
  assert.equal(question.mode, 'retrieval');
  assert.equal(question.source.id, flaskChunk.id);
  assert.equal(question.source.title, flaskChunk.title);
  assert.equal(question.source.answer, flaskChunk.answer);
  assert.equal(question.source.source.repo, flaskChunk.source.repo);
  assert.equal(question.explanation, flaskChunk.answer);
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
  const [flaskChunk] = getRagCorpus().filter(
    (chunk) => chunk.id === 'python_flask_benefits_q13'
  );
  const [listsChunk] = getRagCorpus().filter(
    (chunk) => chunk.id === 'python_lists_vs_tuples_q5'
  );

  const question = retrievalQuizGenerator.generate([
    { chunk: flaskChunk, score: 11, signals: [] },
    { chunk: listsChunk, score: 8, signals: [] },
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
