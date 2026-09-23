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

export interface CodeTaskVerifyResult {
  ok: boolean;
  confidence: 'high' | 'low';
  reason: string;
}

/**
 * B3b's code-task check: deterministic, detect-only, no retry loop —
 * the AC only names citation-groundedness and parallel-tasks as
 * testable clauses, so this stays a small addition rather than a second
 * revise loop layered onto executor.ts's tool-call batches.
 */
export function verifyCodeTask(toolResults: Array<{ ok: boolean; artifactIds: string[] }>): CodeTaskVerifyResult {
  if (toolResults.length === 0) {
    return { ok: true, confidence: 'high', reason: 'no tool calls to verify' };
  }
  const failed = toolResults.some((r) => !r.ok);
  if (failed) {
    return { ok: false, confidence: 'low', reason: 'at least one tool call exited non-zero or errored' };
  }
  return { ok: true, confidence: 'high', reason: 'all tool calls succeeded' };
}
