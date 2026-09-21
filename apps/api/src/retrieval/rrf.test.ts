import { describe, expect, it } from 'vitest';
import { rrfFuse } from './rrf.js';
import type { RetrievedChunk } from './types.js';

function chunk(id: string, score: number): RetrievedChunk {
  return {
    id,
    documentId: 'doc1',
    page: 1,
    bbox: { x0: 0, y0: 0, x1: 1, y1: 1 },
    sectionPath: [],
    text: `chunk ${id}`,
    kind: 'text',
    suspicious: false,
    score,
  };
}

describe('rrfFuse', () => {
  it('ranks a chunk that appears near the top of both lists highest', () => {
    const vector = [chunk('a', 0.9), chunk('b', 0.8), chunk('c', 0.7)];
    const fts = [chunk('b', 10), chunk('a', 5), chunk('d', 1)];

    const fused = rrfFuse(vector, fts);
    expect(fused[0]!.id === 'a' || fused[0]!.id === 'b').toBe(true);
    expect(fused.map((c) => c.id)).toEqual(expect.arrayContaining(['a', 'b', 'c', 'd']));
  });

  it('dedupes chunks that appear in both lists', () => {
    const vector = [chunk('a', 0.9)];
    const fts = [chunk('a', 10)];
    const fused = rrfFuse(vector, fts);
    expect(fused).toHaveLength(1);
  });

  it('returns only-vector and only-fts results too', () => {
    const vector = [chunk('a', 0.9)];
    const fts = [chunk('b', 10)];
    const fused = rrfFuse(vector, fts);
    expect(fused.map((c) => c.id).sort()).toEqual(['a', 'b']);
  });
});
