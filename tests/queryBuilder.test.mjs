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
const outDir = path.join(repoRoot, '.tmp-query-builder-tests');

let buildRetrievalQuery;
let buildConversationContext;

function compileQueryBuilder() {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, 'package.json'),
    JSON.stringify({ type: 'commonjs' }, null, 2)
  );

  const program = ts.createProgram(
    [
      path.join(repoRoot, 'types/rag.ts'),
      path.join(repoRoot, 'lib/rag/corpus.ts'),
      path.join(repoRoot, 'lib/rag/queryBuilder.ts'),
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

    throw new Error(`Query builder compilation failed:\n${message}`);
  }

  const queryBuilderModule = require(
    path.join(outDir, 'lib/rag/queryBuilder.js')
  );

  buildRetrievalQuery = queryBuilderModule.buildRetrievalQuery;
  buildConversationContext = queryBuilderModule.buildConversationContext;
}

before(() => {
  compileQueryBuilder();
});

test('prefers the active current topic over stale earlier prompts', () => {
  const conversationContext = buildConversationContext({
    currentUserPrompt: 'What is ROC curve and when should you use it?',
    recentUserPrompts: [
      'Explain what Flask is and its benefits.',
      'Compare lists and tuples in Python.',
    ],
    recentAssistantReplies: [
      'ROC curve is used for classifier threshold trade-offs and AUC comparison.',
    ],
  });

  assert.equal(conversationContext.intent, 'define');
  assert.ok(conversationContext.entities.some((entity) => /roc curve/i.test(entity)));
  assert.ok(
    conversationContext.relatedConcepts.some((concept) => /auc|threshold/i.test(concept))
  );
  assert.ok(
    conversationContext.retrievalQueries.some((query) => /roc curve/i.test(query))
  );
});

test('falls back to earlier user topics when the current prompt is vague', () => {
  const conversationContext = buildConversationContext({
    currentUserPrompt: 'Why?',
    recentUserPrompts: [
      'How do I optimize logistic regression for imbalanced data?',
      'What metric should I use to evaluate the classifier?',
    ],
    recentAssistantReplies: [
      'Logistic regression is a classification model with a sigmoid boundary and ROC/AUC trade-offs.',
    ],
  });

  assert.equal(conversationContext.intent, 'explain');
  assert.ok(
    conversationContext.entities.some((entity) => /logistic regression/i.test(entity))
  );
  assert.ok(
    conversationContext.relatedConcepts.some((concept) => /classification|roc curve/i.test(concept))
  );
});

test('treats a single new topical token as a fresh topic anchor', () => {
  const conversationContext = buildConversationContext({
    currentUserPrompt: 'RCO',
    recentUserPrompts: ['Explain what Flask is and its benefits.'],
  });

  assert.equal(conversationContext.entities[0], 'rco');
  assert.match(conversationContext.retrievalQueries[0], /rco/i);
});

test('normalizes whitespace and strips low-signal framing words', () => {
  const query = buildRetrievalQuery({
    currentUserPrompt: '   Explain   the difference between   lists and tuples   ',
    recentUserPrompts: [],
  });

  assert.match(query, /lists tuples/i);
  assert.match(query, /difference/i);
});

test('adds assistant topic expansion only when it overlaps the user topic', () => {
  const conversationContext = buildConversationContext({
    currentUserPrompt: 'How does logistic regression work?',
    recentUserPrompts: [],
    recentAssistantReplies: [
      'Logistic regression is used for classification and is often contrasted with linear regression.',
      'Flask is a Python microframework for web applications.',
    ],
  });

  assert.ok(
    conversationContext.entities.some((entity) => /logistic regression/i.test(entity))
  );
  assert.ok(
    conversationContext.relatedConcepts.some((concept) => /linear regression|classification/i.test(concept))
  );
  assert.ok(
    conversationContext.relatedConcepts.every((concept) => !/flask/i.test(concept))
  );
});

test('captures comparison intent and creates comparison-aware retrieval queries', () => {
  const conversationContext = buildConversationContext({
    currentUserPrompt: 'What is the difference between linear regression and logistic regression?',
    recentUserPrompts: [],
    recentAssistantReplies: [
      'Linear regression predicts continuous values while logistic regression predicts class probabilities.',
    ],
  });

  assert.equal(conversationContext.intent, 'compare');
  assert.ok(
    conversationContext.entities.some((entity) => /linear regression/i.test(entity))
  );
  assert.ok(
    conversationContext.entities.some((entity) => /logistic regression/i.test(entity))
  );
  assert.ok(
    conversationContext.retrievalQueries.some((query) => /difference/i.test(query))
  );
});
