# Privacy Model

wAItwise is local-first in the current prototype.

## Stored Locally

The extension stores these values in `chrome.storage.local`:

- quiz mode
- active provider
- one provider API key
- widget position
- theme
- quiz stats
- answered quiz attempts
- recent quiz source ids
- Wiz pet state

## Provider Calls

When a provider-backed quiz is needed, wAItwise calls the selected provider API directly from the extension runtime.

Configured host permissions include:

- `https://generativelanguage.googleapis.com/*`
- `https://api.openai.com/*`
- `https://api.anthropic.com/*`

The prototype does not include a shared backend service or hosted secret store.

## Retrieval Data

The RAG corpus is bundled with the extension as local metadata. Retrieval Review sends selected topic metadata to the configured provider so the provider can generate a conceptual quiz.

## MV3 Constraint

Manifest V3 does not allow extension-executed remotely hosted code. Provider APIs can return data, but executable code must be bundled locally.
