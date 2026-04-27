# RAG Corpus

The retrieval corpus lives at:

```text
lib/rag/corpus.json
```

It is a clean topic index, not a copied question-answer dataset.

## Corpus Shape

Each entry follows the `RetrievedChunk` type in `types/rag.ts`.

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

## Design Rule

Topic-index entries are metadata anchors. They should contain title, tags, created time, keywords, neutral summaries, source path, and source URL.

Do not copy full Notion page bodies into the corpus. The selected provider should generate the quiz from topic metadata, not from stored ground-truth Q&A text.

## Retrieval Flow

1. The content script builds a `ConversationContext`.
2. The background worker runs up to three retrieval queries.
3. `lib/rag/retriever.ts` scores title, tag, keyword, category, subcategory, and text-token signals.
4. Context-fit bonuses favor matching entities, related concepts, and intent.
5. Recently shown source ids are penalized to reduce repetition.
6. The router checks retrieval confidence before asking the provider for a retrieval quiz.

## Confidence

Retrieval must pass both a primary score threshold and a score-gap threshold. If it does not, retrieval mode can still generate from a random topic when a provider key is available.
