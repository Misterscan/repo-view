import { ChunkDoc } from '../types';

export function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0, mA = 0, mB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; mA += a[i] * a[i]; mB += b[i] * b[i]; }
  return dot / (Math.sqrt(mA) * Math.sqrt(mB));
}

self.onmessage = (e: MessageEvent) => {
  const { qVec, db, topK } = e.data;
  
  const relevant = db
    .map((doc: ChunkDoc) => ({ ...doc, score: cosineSimilarity(qVec, doc.vec) }))
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, topK);
    
  self.postMessage({ relevant });
};
