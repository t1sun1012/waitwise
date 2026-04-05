# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

wAItwise is a Chrome extension (Manifest V3) that detects when an AI site is generating a response and shows a micro-learning quiz widget during the wait. MVP targets ChatGPT only, uses rule-based quiz generation (no LLM), and focuses on getting the detection → widget → storage loop solid before adding polish.

## Stack

- **WXT** — extension scaffold and dev tooling (handles manifest generation, hot reload, content script injection helpers)
- **TypeScript + React** — UI components and typed extension logic
- **Tailwind CSS** — widget styling
- **Chrome Extension APIs** — `chrome.runtime`, `chrome.storage.local`, `chrome.tabs`

## Dev commands

```bash
npm install
npm run dev        # build + open Chrome with extension loaded (WXT handles this)
npm run build      # production build
npm run zip        # package for distribution
```

To load manually: `chrome://extensions` → Developer mode → Load unpacked → select `.output/chrome-mv3/`

## Architecture

The extension has four layers that communicate through Chrome's messaging API.

### 1. Content script (`entrypoints/content.ts`)

Runs inside the ChatGPT page. Responsibilities:
- Watch DOM with `MutationObserver` for generation state changes
- Extract the latest user prompt text
- Inject the quiz widget using WXT's `createShadowRootUi` (Shadow DOM isolates CSS from the host page)
- Remove/update widget when generation ends

Widget lifecycle uses an explicit state machine: `idle → submitted → generating → done`, with a `dismissed` state when the user manually closes the widget mid-generation (don't reshow it for that cycle).

ChatGPT is a SPA — the page does not reload on new conversations. The content script must handle URL/conversation changes and reset state accordingly. Use WXT's `ctx.invalidated` for cleanup.

### 2. Background service worker (`entrypoints/background.ts`)

The central state owner. Responsibilities:
- Receive messages from content script
- Call quiz engine to generate questions
- Read/write `chrome.storage.local`
- Return quiz questions to content script

### 3. Quiz engine (`quiz/`)

Rule-based only for MVP. `quizEngine.ts` decides which quiz type to show:
- First prompt of a session → math quiz
- Subsequent prompts → prompt-based quiz using previous prompt text
- Prompt too vague/short → fallback to math quiz

`promptGenerator.ts` uses keyword matching to classify prompts (`coding`, `math`, `debugging`, `generic`) and fill question templates. No LLM, no remote calls.

### 4. UI layer (`components/`, `entrypoints/popup/`)

React components injected via Shadow DOM into the ChatGPT page. The widget appears in the corner during generation only.

## Shared message contract

All cross-boundary communication goes through typed messages defined in `types/messages.ts`. Never use raw strings for message types — always import from this file. This is the shared contract between the three team members' areas of ownership.

```ts
// Every message type must be defined here
type Message =
  | { type: 'GENERATION_STARTED'; prompt: string }
  | { type: 'GENERATION_ENDED' }
  | { type: 'GET_QUIZ'; previousPrompt?: string }
  | { type: 'QUIZ_ANSWERED'; correct: boolean }
  | { type: 'QUIZ_SKIPPED' };
```

## Key data types (`types/`)

```ts
type QuizMode = 'math' | 'prompt';
type PromptCategory = 'coding' | 'math' | 'debugging' | 'generic';

interface QuizQuestion {
  id: string;
  mode: QuizMode;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

interface QuizContext {
  currentPrompt: string;
  previousPrompt?: string;
  category: PromptCategory;
  firstPrompt: boolean;
}

interface AppSettings {
  enabled: boolean;
  preferredMode: QuizMode | 'auto';
  showGamification: boolean;
}

interface UserStats {
  quizzesShown: number;
  quizzesAnswered: number;
  correctAnswers: number;
  streak: number;
}
```

## Storage schema (`chrome.storage.local`)

```ts
{
  currentPrompt: string,      // prompt from the current/latest submission
  previousPrompt: string,     // prompt from the submission before that
  settings: AppSettings,
  stats: UserStats,
}
```

On each prompt submission, swap `currentPrompt` into `previousPrompt` before writing the new one.

## Generation detection notes

- MutationObserver must be debounced (100–300ms) — streaming fires DOM events constantly
- Target a specific stable container in ChatGPT's DOM, not `document.body`
- Isolate all site-specific selectors inside `lib/detector.ts` so DOM changes only require edits in one place
- The detector is the most brittle part of the extension — treat it as its own module with a clean interface

## Team ownership

- **Person 1** — content script, DOM detection, prompt extraction, widget injection (`entrypoints/content.ts`, `lib/detector.ts`, `lib/dom.ts`)
- **Person 2** — UI components, popup page, options page (`components/`, `entrypoints/popup/`)
- **Person 3** — quiz engine, storage, message passing, background worker (`quiz/`, `lib/storage.ts`, `lib/messaging.ts`, `entrypoints/background.ts`)

## MV3 constraint

Do not execute remotely hosted code or WASM. If adding a local model later (e.g. WebLLM, Transformers.js), the model weights must be bundled inside the extension package or fetched as data from an API — not executed as downloaded code.
