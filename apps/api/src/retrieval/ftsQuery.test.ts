import { describe, expect, it } from 'vitest';
import { buildFtsQuery } from './ftsQuery.js';

describe('buildFtsQuery', () => {
  it('drops filler words and keeps content words, typo included', () => {
    expect(buildFtsQuery('can you identify the difference and report me for the level of cu ad NI')).toBe(
      'identify | difference | level | cu | ad | ni',
    );
  });

  it('keeps short technical queries unchanged in content', () => {
    expect(buildFtsQuery('torque spec bolt')).toBe('torque | spec | bolt');
  });

  it('returns null when nothing significant is left', () => {
    expect(buildFtsQuery('what is it')).toBeNull();
  });

  it('deduplicates repeated terms', () => {
    expect(buildFtsQuery('torque torque bolt')).toBe('torque | bolt');
  });
});
