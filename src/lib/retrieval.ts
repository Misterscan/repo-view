import { type ChunkDoc } from '../types';

// Keyword retrieval keeps repository chat usable without an embedding provider.
export function retrieveByKeywords(docs: ChunkDoc[], query: string, topK: number): ChunkDoc[] {
  const words = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) || [])];
  return docs.map((doc, index) => {
    const text = doc.text.toLowerCase();
    const file = doc.file.toLowerCase();
    const score = words.reduce((score, word) => score + (file.includes(word) ? 5 : 0) + (text.includes(word) ? 1 : 0), 0);
    return { doc, score, index };
  }).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, topK).map(item => item.doc);
}
