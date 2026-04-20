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
  path.join(os.tmpdir(), 'waitwise-provider-adapter-tests-')
);

let buildOpenAIResponsesRequestBody;
let extractOpenAIOutputText;
let buildAnthropicMessagesRequestBody;
let extractAnthropicToolInput;

function compileProviderModules() {
  writeFileSync(
    path.join(outDir, 'package.json'),
    JSON.stringify({ type: 'commonjs' }, null, 2)
  );

  const program = ts.createProgram(
    [
      path.join(repoRoot, 'types/messages.ts'),
      path.join(repoRoot, 'types/rag.ts'),
      path.join(repoRoot, 'lib/providers/shared.ts'),
      path.join(repoRoot, 'lib/providers/openai.ts'),
      path.join(repoRoot, 'lib/providers/anthropic.ts'),
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

    throw new Error(`Provider adapter compilation failed:\n${message}`);
  }

  const openaiModule = require(path.join(outDir, 'lib/providers/openai.js'));
  const anthropicModule = require(path.join(outDir, 'lib/providers/anthropic.js'));

  buildOpenAIResponsesRequestBody = openaiModule.buildOpenAIResponsesRequestBody;
  extractOpenAIOutputText = openaiModule.extractOpenAIOutputText;
  buildAnthropicMessagesRequestBody =
    anthropicModule.buildAnthropicMessagesRequestBody;
  extractAnthropicToolInput = anthropicModule.extractAnthropicToolInput;
}

before(() => {
  compileProviderModules();
});

test('OpenAI request builder emits a strict structured-output payload', () => {
  const body = buildOpenAIResponsesRequestBody(
    'Return a quiz.',
    {
      name: 'waitwise_general_quiz',
      propertyOrdering: ['mode', 'topic'],
      properties: {
        mode: { type: 'string' },
        topic: { type: 'string' },
      },
      required: ['mode', 'topic'],
    },
    200
  );

  assert.equal(body.model, 'gpt-4.1-mini');
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema.additionalProperties, false);
});

test('OpenAI output parser returns the assistant output_text block', () => {
  const text = extractOpenAIOutputText({
    output: [
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text: '{"mode":"general"}',
          },
        ],
      },
    ],
  });

  assert.equal(text, '{"mode":"general"}');
});

test('Anthropic request builder emits tool-use payloads', () => {
  const body = buildAnthropicMessagesRequestBody(
    'Return a quiz.',
    {
      name: 'waitwise_math_quiz',
      propertyOrdering: ['mode', 'question'],
      properties: {
        mode: { type: 'string' },
        question: { type: 'string' },
      },
      required: ['mode', 'question'],
    },
    180
  );

  assert.equal(body.model, 'claude-sonnet-4-20250514');
  assert.equal(body.tool_choice.type, 'tool');
  assert.equal(body.tool_choice.name, 'waitwise_math_quiz');
  assert.equal(body.tools[0].input_schema.additionalProperties, false);
});

test('Anthropic tool parser extracts the forced tool input', () => {
  const input = extractAnthropicToolInput(
    {
      content: [
        {
          type: 'tool_use',
          name: 'waitwise_retrieval_quiz',
          input: { topic: 'python' },
        },
      ],
    },
    'waitwise_retrieval_quiz'
  );

  assert.deepEqual(input, { topic: 'python' });
});
