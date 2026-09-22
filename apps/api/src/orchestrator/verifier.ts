import { extractCitedMarkers } from '../retrieval/index.js';

export interface VerifyResult {
  ok: boolean;
  uncitedClaims: number;
}

/**
 * A3 scope: a deterministic check that every [n] marker in the answer maps
 * to a chunk that was actually retrieved (orchestration.md's Verifier §A3).
 * No revise-with-feedback loop — that's B3. A failed check surfaces a
 * warning; the answer is still returned (blocking on a mis-citation with
 * no revision path would make doc_qa unusable for minor slips).
 */
export function verifyCitations(answerText: string, validMarkers: Set<number>): VerifyResult {
  const cited = extractCitedMarkers(answerText);
  const uncited = cited.filter((marker) => !validMarkers.has(marker));
  return { ok: uncited.length === 0, uncitedClaims: uncited.length };
}
