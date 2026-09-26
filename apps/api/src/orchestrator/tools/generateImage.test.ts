import { describe, expect, it, vi } from 'vitest';
import { generateImageTool } from './generateImage.js';

vi.mock('./saveArtifacts.js', () => ({ saveArtifactRecords: vi.fn().mockResolvedValue([{ id: '11111111-1111-1111-1111-111111111111', filename: 'a.png', mime: 'image/png' }]) }));

const ctx = (generateImage: ReturnType<typeof vi.fn>) => ({ gateway: { generateImage }, user: {}, traceId: 't' }) as never;

describe('generate_image tool', () => {
  it('saves the image as an artifact and reports success', async () => {
    const generateImage = vi.fn().mockResolvedValue({ png: Buffer.from('png'), model: 'llm-image' });
    const res = await generateImageTool.execute({ prompt: 'a pump', width: 500, height: 9999 }, ctx(generateImage));
    expect(res.ok).toBe(true);
    expect(res.artifactIds).toHaveLength(1);
    // sizes are snapped to multiples of 64 within 256..768
    expect(generateImage.mock.calls[0]![0]).toMatchObject({ prompt: 'a pump', width: 512, height: 768 });
  });

  it('says image generation is not running when no image model is registered', async () => {
    const generateImage = vi.fn().mockRejectedValue(new Error('No enabled model configured for role "image"'));
    const res = await generateImageTool.execute({ prompt: 'a pump' }, ctx(generateImage));
    expect(res.ok).toBe(false);
    expect(res.summary).toMatch(/not running/);
  });

  it('rejects an empty prompt without calling the model', async () => {
    const generateImage = vi.fn();
    const res = await generateImageTool.execute({ prompt: '  ' }, ctx(generateImage));
    expect(res.ok).toBe(false);
    expect(generateImage).not.toHaveBeenCalled();
  });
});
