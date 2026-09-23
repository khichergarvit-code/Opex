import { describe, expect, it } from 'vitest';
import { verifyCitations, verifyCodeTask } from './verifier.js';

describe('verifyCitations', () => {
  it('passes when every citation marker is valid', () => {
    const result = verifyCitations('The torque is 50 Nm [1], confirmed on page 2 [2].', new Set([1, 2]));
    expect(result.ok).toBe(true);
    expect(result.uncitedClaims).toBe(0);
  });

  it('fails when a citation marker has no matching retrieved chunk', () => {
    const result = verifyCitations('The torque is 50 Nm [1] and also [3].', new Set([1, 2]));
    expect(result.ok).toBe(false);
    expect(result.uncitedClaims).toBe(1);
  });

  it('passes trivially when there are no citation markers', () => {
    const result = verifyCitations('I found no supporting documents.', new Set());
    expect(result.ok).toBe(true);
    expect(result.uncitedClaims).toBe(0);
  });
});

describe('verifyCodeTask', () => {
  it('passes trivially when no tool calls were made', () => {
    const result = verifyCodeTask([]);
    expect(result.ok).toBe(true);
    expect(result.confidence).toBe('high');
  });

  it('passes when every tool call succeeded', () => {
    const result = verifyCodeTask([{ ok: true, artifactIds: [] }, { ok: true, artifactIds: ['a1'] }]);
    expect(result.ok).toBe(true);
    expect(result.confidence).toBe('high');
  });

  it('fails when any tool call did not succeed', () => {
    const result = verifyCodeTask([{ ok: true, artifactIds: [] }, { ok: false, artifactIds: [] }]);
    expect(result.ok).toBe(false);
    expect(result.confidence).toBe('low');
  });
});
