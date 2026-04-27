# Getting Started

This guide gets the extension running locally as an unpacked Chrome extension.

## Requirements

- Node.js 20 or newer for the docs tooling.
- Chrome or another Chromium browser that supports Manifest V3 extensions.
- Optional provider API key for Gemini, OpenAI, or Anthropic quiz generation.

## Install

```bash
npm install
```

## Build The Extension

```bash
npm run build
```

The build output is generated at:

```text
output/chrome-mv3
```

## Load In Chrome

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Select Load unpacked.
4. Choose `output/chrome-mv3`.
5. Open ChatGPT and submit a prompt.

When ChatGPT begins generating, wAItwise schedules a quiz and mounts the widget after a short delay.

## Run The Docs Locally

```bash
npm run docs:dev
```

VitePress serves the docs locally, usually at:

```text
http://localhost:5173/waitwise/
```

## Useful Commands

```bash
npm run dev
npm run build
npm run zip
npm run test:rag
npm run docs:build
npm run docs:preview
```
