import type { RetrievedChunk } from './types.js';

/** Reciprocal rank fusion, k=60, per documents.md's retrieval pipeline. */
export function rrfFuse(
  vectorResults: RetrievedChunk[],
  ftsResults: RetrievedChunk[],
  k = 60,
): RetrievedChunk[] {
  const rrfScore = new Map<string, number>();
  const byId = new Map<string, RetrievedChunk>();

  vectorResults.forEach((c, i) => {
    rrfScore.set(c.id, (rrfScore.get(c.id) ?? 0) + 1 / (k + i + 1));
    byId.set(c.id, c);
  });
  ftsResults.forEach((c, i) => {
    rrfScore.set(c.id, (rrfScore.get(c.id) ?? 0) + 1 / (k + i + 1));
    byId.set(c.id, c);
  });

  return [...byId.values()]
    .map((c) => ({ ...c, score: rrfScore.get(c.id) ?? 0 }))
    .sort((a, b) => b.score - a.score);
}
