import { describe, expect, it } from 'vitest';
import { selectWithoutRerank } from './rerank.js';
import type { RetrievedChunk } from './types.js';

const chunk = (id: string, score: number): RetrievedChunk => ({
  id, documentId: 'd', page: 1, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 }, sectionPath: [], text: id, kind: 'text', suspicious: false, score,
});

describe('selectWithoutRerank', () => {
  it('reports no support when nothing is close and no keyword matched', () => {
    const v = [chunk('a', 0.3)];
    expect(selectWithoutRerank(v, v, [], 5).noSupport).toBe(true);
  });
  it('keeps chunks when the best vector hit is similar enough', () => {
    const v = [chunk('a', 0.6), chunk('b', 0.5)];
    const out = selectWithoutRerank(v, v, [], 1);
    expect(out.noSupport).toBe(false);
    expect(out.chunks).toHaveLength(1);
  });
  it('keeps chunks when a keyword search matched even if vectors are weak', () => {
    const v = [chunk('a', 0.2)];
    expect(selectWithoutRerank(v, v, [chunk('a', 1)], 5).noSupport).toBe(false);
  });
});
