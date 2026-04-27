# Development

## Project Structure

```text
waitwise/
├── components/
├── docs/
├── entrypoints/
├── lib/
│   ├── providers/
│   └── rag/
├── quiz/
├── tests/
├── types/
└── wxt.config.ts
```

## Extension Commands

```bash
npm run dev
npm run build
npm run zip
```

`npm run build` writes the unpacked Chrome extension to `output/chrome-mv3`.

## Test Commands

```bash
npm run test:rag
```

The current tests cover:

- retrieval scoring
- conversation query building
- Gemini prompt and parsing helpers
- OpenAI and Anthropic structured adapter helpers
- quiz mode routing and fallback behavior

## Docs Commands

```bash
npm run docs:dev
npm run docs:build
npm run docs:preview
```

The docs site is a VitePress project in `docs/`.

## Working Notes

- Keep ChatGPT DOM selectors in `lib/detector.ts`.
- Keep message changes in `types/messages.ts`.
- If the source shape changes, update storage validation and review rendering together.
- Do not add a local retrieval quiz generator for topic-index chunks.
