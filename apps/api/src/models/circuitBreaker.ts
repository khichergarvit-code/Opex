/**
 * Minimal hand-rolled circuit breaker (per-endpoint). Opens after
 * `failureThreshold` consecutive failures, refuses calls for `resetAfterMs`,
 * then allows a single trial call (half-open) before fully closing again.
 */
export class CircuitBreaker {
  private failures = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private openedAt = 0;

  constructor(
    private readonly failureThreshold = 5,
    private readonly resetAfterMs = 30_000,
  ) {}

  canAttempt(): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'open') {
      if (Date.now() - this.openedAt >= this.resetAfterMs) {
        this.state = 'half-open';
        return true;
      }
      return false;
    }
    // half-open: allow exactly one trial call at a time
    return true;
  }

  onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  onFailure(): void {
    this.failures += 1;
    if (this.state === 'half-open' || this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
  }

  getState(): 'closed' | 'open' | 'half-open' {
    return this.state;
  }
}
