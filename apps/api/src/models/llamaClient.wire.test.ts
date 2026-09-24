import { describe, expect, it } from 'vitest';
import { toWireMessages } from './llamaClient.js';

describe('toWireMessages (multimodal)', () => {
  it('turns a turn with images into a text + image_url content array and drops the images key', () => {
    const wire = toWireMessages([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'what does the gauge read?', images: ['data:image/png;base64,AAA', 'data:image/jpeg;base64,BBB'] },
    ]) as Array<{ role: string; content: unknown; images?: unknown }>;

    expect(wire[0]).toEqual({ role: 'system', content: 'sys' });
    expect(wire[1]!.images).toBeUndefined();
    expect(wire[1]!.content).toEqual([
      { type: 'text', text: 'what does the gauge read?' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,BBB' } },
    ]);
  });

  it('leaves plain and empty-image turns exactly as they were', () => {
    const wire = toWireMessages([{ role: 'user', content: 'hi', images: [] }]) as Array<{ content: unknown }>;
    expect(wire[0]!.content).toBe('hi');
  });
});
