import { describe, expect, it } from 'vitest';
import { isSummarizeRequest, pickTarget, planBatches, sampleChunks, type VisibleDocument } from './summarize.js';

const doc = (id: string, filename: string): VisibleDocument => ({ id, filename, classification: 0, pageCount: 3 });
const chunk = (n: number, chars = 400) => ({ text: 'x'.repeat(chars), n });

describe('isSummarizeRequest', () => {
  it.each(['summarise the boiler report', 'Summarize this document', 'give me a TL;DR of it', 'key points of the manual'])('matches %s', (m) =>
    expect(isSummarizeRequest(m)).toBe(true),
  );
  it.each(['what is the torque spec?', 'who is pm of india'])('ignores %s', (m) => expect(isSummarizeRequest(m)).toBe(false));
});

describe('pickTarget', () => {
  const docs = [doc('1', 'Boiler-Report.pdf'), doc('2', 'Pump Manual.pdf')];
  it('finds a document named in the message', () => {
    expect(pickTarget('summarise the boiler report please', docs)).toEqual({ kind: 'found', document: docs[0] });
  });
  it('asks which one when none is named and several exist', () => {
    expect(pickTarget('summarise the document', docs)).toEqual({ kind: 'ambiguous', names: ['Boiler-Report.pdf', 'Pump Manual.pdf'] });
  });
  it('uses the only document when there is one', () => {
    expect(pickTarget('summarise it', [docs[1]!])).toEqual({ kind: 'found', document: docs[1] });
  });
  it('reports none when the user can see no documents', () => {
    expect(pickTarget('summarise the boiler report', [])).toEqual({ kind: 'none' });
  });
});

describe('batching', () => {
  it('splits into batches under the token budget', () => {
    const batches = planBatches(Array.from({ length: 30 }, (_, i) => chunk(i)), 1000);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.flat()).toHaveLength(30);
  });
  it('samples evenly when over the input cap and keeps order', () => {
    const all = Array.from({ length: 200 }, (_, i) => chunk(i));
    const picked = sampleChunks(all, 5000);
    expect(picked.length).toBeLessThan(all.length);
    expect(picked.map((c) => c.n)).toEqual([...picked.map((c) => c.n)].sort((a, b) => a - b));
    expect(picked[0]!.n).toBe(0);
  });
  it('keeps everything when under the cap', () => {
    const all = [chunk(0), chunk(1)];
    expect(sampleChunks(all)).toBe(all);
  });
});

import { isSummarizeAllRequest, stripMarkers } from './summarize.js';

describe('summarise all', () => {
  it('detects requests for several documents', () => {
    expect(isSummarizeAllRequest('summarize all')).toBe(true);
    expect(isSummarizeAllRequest('Summarise every document please')).toBe(true);
    expect(isSummarizeAllRequest('summarise pump-manual.pdf')).toBe(false);
    expect(isSummarizeAllRequest('what is in all of them')).toBe(false);
  });

  it('strips per-document section markers', () => {
    expect(stripMarkers('Torque is 460 Nm [2]. Then inspect [1, 3].')).toBe('Torque is 460 Nm. Then inspect.');
  });
});
