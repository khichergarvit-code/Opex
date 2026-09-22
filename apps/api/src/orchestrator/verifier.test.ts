import { describe, expect, it } from 'vitest';
import { verifyCitations } from './verifier.js';

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
