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
const outDir = path.join(repoRoot, '.tmp-retriever-tests');

let retrieveRelevantChunks;

function compileRetrieverModules() {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, 'package.json'),
    JSON.stringify({ type: 'commonjs' }, null, 2)
  );

  const program = ts.createProgram(
    [
      path.join(repoRoot, 'types/rag.ts'),
      path.join(repoRoot, 'lib/rag/corpus.ts'),
      path.join(repoRoot, 'lib/rag/retriever.ts'),
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

    throw new Error(`Retriever compilation failed:\n${message}`);
  }

  const retrieverModule = require(
    path.join(outDir, 'lib/rag/retriever.js')
  );

  retrieveRelevantChunks = retrieverModule.retrieveRelevantChunks;
}

before(() => {
  compileRetrieverModules();
});

test('returns the Naive Bayes chunk for conditional independence queries', () => {
  const results = retrieveRelevantChunks(
    'How does Naive Bayes make predictions with conditional independence?'
  );

  assert.ok(results.length > 0);
  assert.match(results[0].chunk.id, /naive-bayes/);
  assert.ok(
    results[0].signals.some((signal) =>
      signal.value.toLowerCase().includes('bayes')
    )
  );
});

test('returns the vanishing gradient chunk for deep network gradient queries', () => {
  const results = retrieveRelevantChunks(
    'What causes vanishing gradients in deep neural networks?'
  );

  assert.ok(results.length > 0);
  assert.equal(
    results[0].chunk.id,
    'vanishing-gradient-00505317b53783dda3ba81abc8efc3de'
  );
});

test('returns the logistic regression chunk for sigmoid classification queries', () => {
  const results = retrieveRelevantChunks(
    'How does logistic regression use sigmoid for classification?'
  );

  assert.ok(results.length > 0);
  assert.match(results[0].chunk.id, /logistic-regression/);
  assert.ok(
    results[0].signals.some((signal) => signal.value === 'logistic')
  );
});

test('returns the PCA chunk for dimensionality reduction queries', () => {
  const results = retrieveRelevantChunks(
    'How does PCA reduce dimensionality?'
  );

  assert.ok(results.length > 0);
  assert.equal(
    results[0].chunk.id,
    'difference-between-lda-and-pca-for-dimensionality-reduction-cf105317b537829ea923815818e9d040'
  );
});

test('returns the RAG chunk for retrieval augmented generation queries', () => {
  const results = retrieveRelevantChunks(
    'What is retrieval augmented generation RAG?'
  );

  assert.ok(results.length > 0);
  assert.equal(
    results[0].chunk.id,
    'retrieval-augmented-generation-26f05317b537827aa89b811c664ca039'
  );
});

test('returns a Transformer chunk for attention queries', () => {
  const results = retrieveRelevantChunks(
    'How does a transformer use attention?'
  );

  assert.ok(results.length > 0);
  assert.match(results[0].chunk.id, /transformer/);
});

test('respects topK and minScore options', () => {
  const results = retrieveRelevantChunks('retrieval augmented generation rag', {
    topK: 1,
    minScore: 5,
  });

  assert.equal(results.length, 1);
  assert.equal(
    results[0].chunk.id,
    'retrieval-augmented-generation-26f05317b537827aa89b811c664ca039'
  );
});

test('returns an empty list for empty or unrelated queries', () => {
  assert.deepEqual(retrieveRelevantChunks(''), []);
  assert.deepEqual(retrieveRelevantChunks('zzzxqv unrelated gibberish', { minScore: 2 }), []);
});
