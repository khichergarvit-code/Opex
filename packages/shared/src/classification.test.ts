import { describe, expect, it } from 'vitest';
import { classificationSchema, roleSchema } from './classification.js';

describe('classificationSchema', () => {
  it('accepts levels 0-3', () => {
    for (const level of [0, 1, 2, 3]) {
      expect(classificationSchema.safeParse(level).success).toBe(true);
    }
  });

  it('rejects out-of-range levels', () => {
    expect(classificationSchema.safeParse(4).success).toBe(false);
    expect(classificationSchema.safeParse(-1).success).toBe(false);
  });
});

describe('roleSchema', () => {
  it('accepts the three defined roles', () => {
    expect(roleSchema.safeParse('super_admin').success).toBe(true);
    expect(roleSchema.safeParse('workspace_admin').success).toBe(true);
    expect(roleSchema.safeParse('employee').success).toBe(true);
  });

  it('rejects unknown roles', () => {
    expect(roleSchema.safeParse('root').success).toBe(false);
  });
});
