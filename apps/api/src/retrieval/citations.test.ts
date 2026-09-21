import { describe, expect, it } from 'vitest';
import { extractCitedMarkers } from './citations.js';

describe('extractCitedMarkers', () => {
  it('extracts unique marker numbers from an answer', () => {
    expect(extractCitedMarkers('The bolt needs [1] 50 Nm, see also [2] and [1] again.')).toEqual([
      1, 2,
    ]);
  });

  it('returns an empty array when there are no markers', () => {
    expect(extractCitedMarkers('No citations here.')).toEqual([]);
  });
});
