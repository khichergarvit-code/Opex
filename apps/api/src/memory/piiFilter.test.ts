import { describe, expect, it } from 'vitest';
import { containsSecretOrPii } from './piiFilter.js';

describe('containsSecretOrPii', () => {
  it('flags a key=value looking secret', () => {
    expect(containsSecretOrPii('password: sup3rSecretValue123')).toBe(true);
  });

  it('flags a credit-card-shaped number', () => {
    expect(containsSecretOrPii('my card is 4111 1111 1111 1111')).toBe(true);
  });

  it('does not flag an ordinary preference sentence', () => {
    expect(containsSecretOrPii('The user prefers torque specs in Nm, not ft-lb.')).toBe(false);
  });
});
