<div align="center">

# wAItwise

**A Chrome extension that turns AI wait time into active thinking.**

![stage](https://img.shields.io/badge/stage-prototype_v2-115e59?style=for-the-badge)
![platform](https://img.shields.io/badge/platform-chrome_extension-2563eb?style=for-the-badge&logo=googlechrome&logoColor=white)
![target](https://img.shields.io/badge/target-chatgpt-111827?style=for-the-badge&logo=openai&logoColor=white)
![modes](https://img.shields.io/badge/modes-retrieval%20%7C%20general%20%7C%20math-d97706?style=for-the-badge)
![providers](https://img.shields.io/badge/providers-gemini%20%7C%20openai%20%7C%20anthropic-6d28d9?style=for-the-badge)
![stack](https://img.shields.io/badge/stack-wxt%20%7C%20react%20%7C%20typescript-0f766e?style=for-the-badge)

</div>

wAItwise is a Chrome extension prototype that detects when ChatGPT is thinking and shows a lightweight quiz during that wait time. The goal is simple: instead of passively staring at the screen, the user gets one short prompt to think, review, or practice.

The project now supports three different quiz experiences:

- **Retrieval Review**: conceptual technical interview questions generated from a local Notion topic index
- **General Thinking**: prompt-anchored questions that extend the user’s thinking on any ChatGPT topic
- **Math Drill**: quick arithmetic practice as a clean fallback or focused mode

## Why wAItwise

wAItwise explores one product idea:

> AI wait time can become thinking time.

Instead of adding another chatbot or another passive widget, wAItwise tries to create a small reflective loop while the model is generating.

## Current Capabilities

### Quiz Modes

- **Retrieval Review**
  - Uses conversation context plus a local Notion topic index
  - Builds that index from the public [ML/CV Notion technical interview database](https://sassy-glasses-37e.notion.site/a649eaead75a4db7a40c942610aed5bb?v=6bad6d4e8ab94eb494594a87ae72ebca)
  - Retrieves relevant topic chunks by title, tags, keywords, and summary
  - Generates conceptual multiple-choice quizzes with the selected provider
  - Falls back to a random topic when no confident topic match exists
  - Shows source links inside the widget

- **General Thinking**
  - Uses the user’s prompt as the main anchor
  - Generates one short multiple-choice question that expands the user’s thinking
  - Works for broader, non-technical ChatGPT usage

- **Math Drill**
  - Generates quick arithmetic questions
  - Works as a lightweight fallback path
  - Also works as a dedicated practice mode

### LLM Provider Support

wAItwise supports one active provider at a time:

- Gemini
- OpenAI
- Anthropic

The selected provider and API key are stored locally in the extension popup. There is no shared backend key in this setup.

## How It Works

1. The extension runs on ChatGPT.
2. It detects when the user submits a prompt and when ChatGPT starts generating.
3. It chooses the active quiz mode.
4. It generates or retrieves one quiz.
5. The widget appears while ChatGPT is still working.
6. The user can answer, skip, close, and later review attempts in the popup hub.

## Tech Stack

- **Framework**: WXT
- **Frontend**: React
- **Language**: TypeScript
- **Storage**: `chrome.storage.local`
- **Retrieval**: local Notion topic index + lexical/context-aware ranking
- **LLM Providers**: Gemini, OpenAI, Anthropic

## Retrieval Corpus Source

The retrieval corpus in `lib/rag/corpus.json` is a clean topic index derived from this public Notion database:

[ML/CV technical interview database](https://sassy-glasses-37e.notion.site/a649eaead75a4db7a40c942610aed5bb?v=6bad6d4e8ab94eb494594a87ae72ebca)

The corpus stores topic metadata such as titles, tags, created dates, keywords, neutral summaries, and source links. It does not store copied full page bodies.

## Project Structure

```text
waitwise/
├── components/
├── entrypoints/
├── lib/
│   ├── providers/
│   └── rag/
├── quiz/
├── tests/
├── types/
└── wxt.config.ts
```

## Quick Setup

### 1. Clone the repo

```bash
git clone git@github.com:t1sun1012/waitwise.git
cd waitwise
```

If you prefer HTTPS:

```bash
git clone https://github.com/t1sun1012/waitwise.git
cd waitwise
```

### 2. Install dependencies

```bash
npm install
```

### 3. Build the extension

```bash
npm run build
```

This generates the unpacked extension in:

```text
output/chrome-mv3
```

### 4. Load it in Chrome

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select `output/chrome-mv3`

### 5. Test it on ChatGPT

1. Open [ChatGPT](https://chatgpt.com/)
2. Submit a prompt
3. Wait for ChatGPT to enter its thinking/generating state
4. The wAItwise widget should appear on the page

## Useful Commands

```bash
npm install
npm run build
npm run test:rag
```

If you change the code, run `npm run build` again and then refresh the extension on `chrome://extensions`.

## Status

This is still a prototype, but the current system already supports:

- in-page quiz widget injection on ChatGPT
- review hub popup
- local quiz history and stats
- provider-generated technical interview quizzes from the Notion topic index
- general prompt-based quizzes
- multi-provider LLM support

## Next Direction

The next major step is improving data quality and retrieval quality:

- keep the corpus as clean topic metadata instead of copied page bodies
- improve domain coverage
- make retrieval relevance more stable across broader conversations
- strengthen review and reflection flows

## Team Notes

If you are joining the project for the first time, start with:

1. `npm install`
2. `npm run build`
3. load `output/chrome-mv3` in Chrome
4. test on ChatGPT

That is enough to get the extension running locally.
