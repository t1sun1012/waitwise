# User Guide

wAItwise appears only while ChatGPT is generating. The quiz is intended to be fast enough to answer during a normal wait.

## Quiz Modes

### Retrieval Review

Retrieval Review uses the current conversation context to search the local Notion topic index. When it finds a confident match, it sends the top topic metadata to the selected provider and asks for one conceptual technical interview quiz.

If the retrieval match is weak and a provider API key exists, wAItwise generates from a random topic instead. If provider generation is unavailable or fails, it falls back to Math Drill.

### General Thinking

General Thinking uses the user’s current ChatGPT prompt as the anchor. The provider generates one short multiple-choice question that extends the user’s thinking without needing the local RAG corpus.

This mode is useful for non-technical prompts, broad learning, writing, planning, and open-ended exploration.

### Math Drill

Math Drill creates quick arithmetic practice. If a provider key is configured, wAItwise tries provider-backed math first. If not, it uses the local math generator.

## Provider Settings

The popup lets the user choose one active provider:

- Gemini
- OpenAI
- Anthropic

The provider API key is stored locally in extension storage. There is no shared backend key in this prototype.

## Review Hub

The popup is also the review hub. It shows:

- quizzes shown
- quizzes answered
- accuracy
- streak
- past attempts grouped by mode
- source metadata for retrieval quizzes
- Wiz pet progress

## Widget Behavior

The in-page widget is draggable. wAItwise stores the last committed position locally and clamps it to the viewport on resize so it remains visible.
