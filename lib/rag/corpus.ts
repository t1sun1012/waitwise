import rawCorpus from './corpus.json';
import type { RetrievedChunk } from '../../types/rag';

export const ragCorpus: RetrievedChunk[] = rawCorpus as RetrievedChunk[];

export function getRagCorpus(): RetrievedChunk[] {
  return ragCorpus;
}
