/**
 * Heuristic-only secret/PII detection for memory.md step 2 ("drop
 * candidates that contain secrets or PII"). This is deliberately not
 * exhaustive — same honesty as the rest of this project's regex-based
 * heuristics (e.g. ingest's injection.py) — documented as Debt, not
 * presented as a real DLP system (that's B6's scope).
 */
const SECRET_PATTERNS: RegExp[] = [
  /\b(sk|pk|api|key|token|secret)[-_]?[A-Za-z0-9]{16,}\b/i,
  /\b[A-Za-z0-9+/]{32,}={0,2}\b/, // long base64-ish blob
  /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/, // credit-card-shaped
  /\b(password|passwd|secret)\s*[:=]\s*\S+/i,
];

export function containsSecretOrPii(text: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(text));
}
