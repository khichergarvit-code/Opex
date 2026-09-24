import type { ModelGateway } from '../models/gateway.js';
import type { AuthedUser } from '../policy/types.js';
import type { RetrievedChunk } from './types.js';

/**
 * bge-reranker-v2-m3's /v1/rerank returns raw (unbounded, often negative)
 * logits, not a 0-1 score — confirmed live: a genuinely relevant chunk
 * scored around -2 to -3, an irrelevant one around -11. This threshold is a
 * starting point on that real scale, not a spec number — tune once the
 * recall@5 baseline run shows the actual score distribution across the
 * seed corpus's ~40 questions.
 */
export const NO_SUPPORT_THRESHOLD = -6;

export async function rerankChunks(
  gateway: ModelGateway,
  user: AuthedUser,
  traceId: string,
  query: string,
  candidates: RetrievedChunk[],
  finalK: number,
): Promise<{ chunks: RetrievedChunk[]; noSupport: boolean }> {
  if (candidates.length === 0) {
    return { chunks: [], noSupport: true };
  }

  const scores = await gateway.rerank({
    query,
    documents: candidates.map((c) => c.text),
    user,
    traceId,
  });

  const scored = candidates
    .map((c, i) => ({ ...c, score: scores[i] ?? -Infinity }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < NO_SUPPORT_THRESHOLD) {
    return { chunks: [], noSupport: true };
  }

  return { chunks: scored.slice(0, finalK), noSupport: false };
}

/**
 * Fallback when no reranker model is configured: keep the RRF order and decide
 * "no support" from bge-m3 cosine similarity of the best vector hit, or any
 * keyword (FTS) hit. Coarser than a cross-encoder, but keeps the
 * "answer from documents, else general knowledge" behavior working.
 */
export const VECTOR_NO_SUPPORT_THRESHOLD = 0.45;

export function selectWithoutRerank(
  fused: RetrievedChunk[],
  vectorResults: RetrievedChunk[],
  ftsResults: RetrievedChunk[],
  finalK: number,
): { chunks: RetrievedChunk[]; noSupport: boolean } {
  const bestVector = vectorResults.reduce((max, c) => Math.max(max, c.score), -Infinity);
  if (fused.length === 0 || (ftsResults.length === 0 && bestVector < VECTOR_NO_SUPPORT_THRESHOLD)) {
    return { chunks: [], noSupport: true };
  }
  return { chunks: fused.slice(0, finalK), noSupport: false };
}
