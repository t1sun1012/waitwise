---
layout: home

hero:
  name: wAItwise
  text: Turn AI wait time into active thinking.
  tagline: A Chrome extension prototype that detects ChatGPT generation and shows one short micro-learning quiz while the model works.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: Read Architecture
      link: /architecture

features:
  - title: Wait-time learning loop
    details: Detects when ChatGPT starts generating, waits briefly, then mounts a lightweight quiz widget into the page.
  - title: Three quiz modes
    details: Retrieval Review, General Thinking, and Math Drill let the extension adapt to technical review, broad reflection, or quick practice.
  - title: Local-first settings
    details: Provider choice, API key, widget position, stats, attempts, and pet progress live in chrome.storage.local.
  - title: Provider-generated review
    details: Retrieval mode uses a local Notion topic index as metadata anchors, then asks the selected provider to generate the actual quiz.
  - title: Review hub
    details: The popup collects mode settings, provider settings, quiz history, accuracy, streaks, source links, and Wiz progress.
  - title: Extension-native architecture
    details: Content script, background service worker, provider adapters, RAG utilities, storage helpers, and typed messages stay clearly separated.
---

<script setup>
import { withBase } from 'vitepress';
</script>

## What This Project Is

wAItwise explores a small product idea: while an AI system is generating, the user has a few seconds of attention available. Instead of letting that moment become passive waiting, wAItwise turns it into one compact prompt for recall, reflection, or practice.

The current prototype runs on ChatGPT, watches generation state, and shows a quiz widget while ChatGPT is still working. It also includes a popup review hub where the user can configure quiz behavior and review past attempts.

## User Workflow

<figure class="doc-image-frame">
  <a class="doc-image-link" :href="withBase('/images/waitwise-user-workflow.png')" target="_blank" rel="noopener">
    <img
      class="diagram-light"
      :src="withBase('/images/waitwise-user-workflow.png')"
      alt="wAItwise user workflow from prompt submission through detection, mode choice, quiz generation, answering, and local review storage"
    />
    <img
      class="diagram-dark"
      :src="withBase('/images/waitwise-user-workflow.png')"
      alt=""
      aria-hidden="true"
    />
  </a>
  <figcaption>
    The core user loop: submit a prompt, detect generation, choose the active mode, generate one quiz, answer it, and save the attempt locally for review.
  </figcaption>
</figure>

## Current Prototype Scope

- ChatGPT generation detection through a content script.
- Shadow DOM quiz widget injected into the page.
- Retrieval Review, General Thinking, and Math Drill modes.
- Gemini, OpenAI, and Anthropic provider adapters.
- Local Notion topic-index corpus for technical interview review.
- Local stats, history, theme, provider settings, widget position, and pet state.

## Public Docs URL

This site is configured for GitHub Pages at:

```text
https://t1sun1012.github.io/waitwise/
```
