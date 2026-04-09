import { ChunkDoc } from '../types';
import { getSessionEmbeddings } from '../lib/db';

export function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0, mA = 0, mB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; mA += a[i] * a[i]; mB += b[i] * b[i]; }
  return dot === 0 || mA === 0 || mB === 0 ? 0 : dot / (Math.sqrt(mA) * Math.sqrt(mB));
}

self.onmessage = async (e: MessageEvent) => {
  const { qVec, sessionId, topK } = e.data;
  if (!sessionId || !qVec) {
    self.postMessage({ relevant: [] });
    return;
  }

  try {
    const db: ChunkDoc[] = await getSessionEmbeddings(sessionId);

    const scored = db.map((doc: ChunkDoc) => ({ ...doc, score: cosineSimilarity(qVec, doc.vec) }));
    scored.sort((a: any, b: any) => b.score - a.score);
    const relevant = scored.slice(0, topK || 10);

    self.postMessage({ relevant });
  } catch {
    // on error, return empty
    self.postMessage({ relevant: [] });
  }
};
