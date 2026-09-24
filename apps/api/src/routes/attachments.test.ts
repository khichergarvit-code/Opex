import { describe, expect, it } from 'vitest';
import { sniffImageMime } from './attachments.js';

describe('sniffImageMime', () => {
  it('recognises PNG, JPEG and WebP by their bytes', () => {
    expect(sniffImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe('image/png');
    expect(sniffImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg');
    expect(sniffImageMime(Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ')]))).toBe('image/webp');
  });

  it('rejects anything else, whatever the client claimed (e.g. an HTML or SVG file renamed .png)', () => {
    expect(sniffImageMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImageMime(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(sniffImageMime(Buffer.alloc(0))).toBeNull();
  });
});
