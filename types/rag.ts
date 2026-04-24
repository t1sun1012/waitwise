export interface CorpusSource {
  repo: string;
  path: string;
  url: string;
  pageId?: string;
}

export type CorpusChunkType = 'question-answer' | 'note' | 'topic-only';

export type ConversationIntent =
  | 'compare'
  | 'example'
  | 'debug'
  | 'define'
  | 'explain'
  | 'generic';

export interface ConversationContext {
  currentUserPrompt: string;
  previousUserPrompts: string[];
  recentAssistantReplies: string[];
  intent: ConversationIntent;
  entities: string[];
  relatedConcepts: string[];
  summary: string;
  retrievalQueries: string[];
}

export interface RetrievedChunk {
  id: string;
  corpus: string;
  category: string;
  subcategory?: string;
  chunkType?: CorpusChunkType;
  title: string;
  question: string;
  answer: string;
  tags: string[];
  keywords: string[];
  text: string;
  source: CorpusSource;
}

export interface RetrievalSignal {
  kind:
    | 'tag'
    | 'keyword'
    | 'category'
    | 'subcategory'
    | 'title-token'
    | 'text-token';
  value: string;
  weight: number;
}

export interface RankedRetrievedChunk {
  chunk: RetrievedChunk;
  score: number;
  signals: RetrievalSignal[];
}
