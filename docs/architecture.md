# Architecture

<script setup>
import { withBase } from 'vitepress';
</script>

wAItwise has four main layers connected by typed Chrome runtime messages.

<figure class="doc-image-frame doc-image-wide">
  <img
    :src="withBase('/images/waitwise-architecture-overview.png')"
    alt="wAItwise architecture overview showing ChatGPT page, content script, background worker, quiz engines, shared data layer, and review hub popup"
  />
  <figcaption>
    Runtime overview: the ChatGPT page triggers the content script, the background worker routes quiz generation, shared storage keeps local state, and the popup provides settings and review history.
  </figcaption>
</figure>

## Content Script

Source: `entrypoints/content.tsx`

The content script runs on:

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

Responsibilities:

- start the ChatGPT generation detector
- gather the latest prompt and recent conversation context
- build retrieval context
- request a quiz from the background service worker
- mount the React widget with WXT `createShadowRootUi`
- reset state on ChatGPT SPA navigation

ChatGPT-specific DOM selectors are isolated in `lib/detector.ts`.

## Detector

Source: `lib/detector.ts`

The detector observes stable ChatGPT containers with a `MutationObserver`. It treats generation as active when it sees either:

- a visible Thinking indicator
- a stop-generation control in the composer area

End detection is debounced because streaming can produce frequent DOM mutations.

## Background Service Worker

Source: `entrypoints/background.ts`

The background worker owns cross-feature state flow:

- receives `GET_QUIZ`, `QUIZ_ANSWERED`, and `QUIZ_SKIPPED`
- retrieves and diversifies RAG chunks
- reads provider settings and quiz mode
- routes generation through `lib/quizModeRouter.ts`
- records quiz stats, attempts, and recent source ids

## Quiz Router

Source: `lib/quizModeRouter.ts`

The router chooses the generation path based on mode, provider key availability, retrieval confidence, and provider success.

Core behavior:

- retrieval mode uses provider-generated quizzes from topic metadata
- weak retrieval can generate from a random topic
- general mode requires current prompt plus a provider key
- math mode can use a provider or local fallback
- all failed provider paths end in local math fallback

## Provider Layer

Sources:

- `lib/providers/gemini.ts`
- `lib/providers/openai.ts`
- `lib/providers/anthropic.ts`
- `lib/providers/shared.ts`

Each provider adapter builds a structured request, parses the provider response, validates the payload, and normalizes it into a shared `QuizQuestion`.

The shared provider code defines the JSON shapes for retrieval, general, and math quizzes.

## UI Layer

Sources:

- `components/QuizWidget.tsx`
- `components/ReviewHub.tsx`
- `components/PetDisplay.tsx`
- `entrypoints/popup/main.tsx`

The widget is injected into ChatGPT. The popup renders settings, review history, stats, theme controls, and Wiz progress.

## Message Contract

Source: `types/messages.ts`

All cross-boundary communication uses the shared `Message` union. Avoid raw message type strings when a typed contract already exists.
