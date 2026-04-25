# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## What This Project Is

wAItwise is a Chrome extension (Manifest V3) that detects when ChatGPT is generating a response and shows a short micro-learning quiz widget during the wait. The current prototype supports provider-generated quizzes, a Notion-backed topic index for retrieval review, popup settings, and a review hub for past attempts.

## Stack

- **WXT**: extension scaffold and dev tooling
- **TypeScript + React**: UI components and typed extension logic
- **Tailwind CSS**: widget styling
- **Chrome Extension APIs**: `chrome.runtime`, `chrome.storage.local`, `chrome.tabs`

## Dev Commands

```bash
npm install
npm run dev        # WXT dev server
npm run build      # production build
npm run zip        # package for distribution
npm run test:rag   # retrieval/provider/router tests
```

To load manually: `chrome://extensions` -> Developer mode -> Load unpacked -> select `output/chrome-mv3/`.

## Architecture

The extension has four main layers that communicate through typed Chrome messages.

### 1. Content Script (`entrypoints/content.tsx`)

Runs inside ChatGPT. Responsibilities:

- Watch the DOM for generation state changes
- Extract the latest user prompt and lightweight conversation context
- Inject the quiz widget using WXT's `createShadowRootUi`
- Remove/update the widget when generation ends

ChatGPT is a SPA, so the content script must handle URL/conversation changes and reset widget state accordingly. Keep site-specific DOM selectors inside `lib/detector.ts`.

### 2. Background Service Worker (`entrypoints/background.ts`)

The central state owner. Responsibilities:

- Receive typed messages from the content script
- Retrieve/rank RAG topic chunks when needed
- Route quiz generation by mode/provider
- Read/write `chrome.storage.local`
- Return quiz questions to the content script

### 3. Quiz and Provider Layer (`lib/quizModeRouter.ts`, `lib/providers/`, `quiz/`)

Current modes:

- **retrieval**: ranks local Notion topic-index chunks, then uses the selected provider to generate a conceptual quiz from topic metadata. If retrieval has no confident match and an API key exists, generate from a random topic. If provider generation fails, fall back to local math.
- **general**: uses the selected provider to generate a prompt-anchored thinking question.
- **math**: uses the selected provider for math when possible, with local `quiz/mathGenerator.ts` as a fallback.

Do not reintroduce a local retrieval quiz generator for topic-index chunks. Topic-index entries are metadata anchors, not ground-truth Q&A answers.

### 4. UI Layer (`components/`, `entrypoints/popup/`)

React components render the in-page widget, popup settings, and review hub. Source links should be visible when a retrieval quiz has source metadata.

## RAG Corpus

The corpus lives at `lib/rag/corpus.json` and is typed by `types/rag.ts`.

Each entry is a clean topic index chunk:

```ts
interface RetrievedChunk {
  id: string;
  corpus: string;
  category: string;
  subcategory?: string;
  chunkType?: 'topic';
  createdAt?: string;
  title: string;
  promptHint: string;
  topicSummary: string;
  tags: string[];
  keywords: string[];
  text: string;
  source: CorpusSource;
}
```

Avoid copying full Notion page bodies into the corpus. Use title, tags, created time, keywords, and neutral topic summaries. The provider should generate the actual quiz.

## Shared Message Contract

All cross-boundary communication goes through typed messages in `types/messages.ts`. Never use raw strings for message types when a typed contract exists.

## Storage

Storage helpers live in `lib/storage.ts`. Quiz history stores the normalized `QuizQuestion`, answer result, and optional `QuizSource`. If you change source shape, update storage validation and review-hub rendering together.

## Generation Detection Notes

- MutationObserver callbacks must be debounced because streaming fires DOM events constantly.
- Target stable ChatGPT containers instead of `document.body`.
- Keep detector changes isolated in `lib/detector.ts`.
- Treat the detector as brittle and verify manually after substantial changes.

## MV3 Constraint

Do not execute remotely hosted code or WASM. Provider APIs may return data, but extension-executed code must be bundled locally.
