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

test('returns the Flask chunk for a Flask web app query', () => {
  const results = retrieveRelevantChunks('Help me build a Flask web app in Python');

  assert.ok(results.length > 0);
  assert.equal(results[0].chunk.id, 'python_flask_benefits_q13');
  assert.ok(
    results[0].signals.some((signal) =>
      signal.value.toLowerCase().includes('flask')
    )
  );
});

test('returns the lists vs tuples chunk for tuple comparison queries', () => {
  const results = retrieveRelevantChunks(
    'What is the difference between a Python list and tuple?'
  );

  assert.ok(results.length > 0);
  assert.equal(results[0].chunk.id, 'python_lists_vs_tuples_q5');
});

test('returns the SQL BETWEEN versus IN chunk for matching operator queries', () => {
  const results = retrieveRelevantChunks(
    'In SQL, what is the difference between BETWEEN and IN operators?'
  );

  assert.ok(results.length > 0);
  assert.equal(results[0].chunk.id, 'sql_between_vs_in_q3');
  assert.ok(
    results[0].signals.some((signal) => signal.kind === 'category')
  );
});

test('returns the ROC curve chunk for ROC and AUC evaluation queries', () => {
  const results = retrieveRelevantChunks(
    'When should I use an ROC curve and AUC for model evaluation?'
  );

  assert.ok(results.length > 0);
  assert.equal(results[0].chunk.id, 'ml_roc_curve_q19');
});

test('returns the long-tailed distribution chunk for heavy-tail questions', () => {
  const results = retrieveRelevantChunks(
    'Why do long tailed distributions matter for classification problems?'
  );

  assert.ok(results.length > 0);
  assert.equal(results[0].chunk.id, 'stats_long_tailed_distribution_q6');
});

test('returns the unfair coin Bayes chunk for posterior coin-flip questions', () => {
  const results = retrieveRelevantChunks(
    'How do you use Bayes theorem to infer whether a coin is unfair after five tails?'
  );

  assert.ok(results.length > 0);
  assert.equal(results[0].chunk.id, 'prob_unfair_coin_bayes_q8');
});

test('returns the autoencoder chunk for encoder decoder representation questions', () => {
  const results = retrieveRelevantChunks(
    'What is an autoencoder with an encoder, bottleneck, and decoder?'
  );

  assert.ok(results.length > 0);
  assert.equal(results[0].chunk.id, 'dl_autoencoders_q1');
});

test('respects topK and minScore options', () => {
  const results = retrieveRelevantChunks('flask python framework', {
    topK: 1,
    minScore: 5,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].chunk.id, 'python_flask_benefits_q13');
});

test('returns an empty list for empty or unrelated queries', () => {
  assert.deepEqual(retrieveRelevantChunks(''), []);
  assert.deepEqual(retrieveRelevantChunks('zzzxqv unrelated gibberish', { minScore: 2 }), []);
});
