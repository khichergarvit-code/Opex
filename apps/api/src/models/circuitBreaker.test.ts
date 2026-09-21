import { describe, expect, it, vi } from 'vitest';
import { CircuitBreaker } from './circuitBreaker.js';

describe('CircuitBreaker', () => {
  it('starts closed and allows attempts', () => {
    const cb = new CircuitBreaker(3, 1000);
    expect(cb.canAttempt()).toBe(true);
    expect(cb.getState()).toBe('closed');
  });

  it('opens after reaching the failure threshold', () => {
    const cb = new CircuitBreaker(3, 1000);
    cb.onFailure();
    cb.onFailure();
    expect(cb.getState()).toBe('closed');
    cb.onFailure();
    expect(cb.getState()).toBe('open');
    expect(cb.canAttempt()).toBe(false);
  });

  it('moves to half-open after the reset window and closes on success', () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker(1, 1000);
    cb.onFailure();
    expect(cb.canAttempt()).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(cb.canAttempt()).toBe(true);
    expect(cb.getState()).toBe('half-open');
    cb.onSuccess();
    expect(cb.getState()).toBe('closed');
    vi.useRealTimers();
  });
});
