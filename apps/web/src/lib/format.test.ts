import { describe, expect, it } from 'vitest';
import { formatDateTime } from './format';

const now = new Date(2026, 8, 26, 15, 0, 0);
describe('formatDateTime', () => {
  it('is relative for the last hour', () => {
    expect(formatDateTime(new Date(2026, 8, 26, 14, 58, 0), now)).toBe('2 min ago');
    expect(formatDateTime(new Date(2026, 8, 26, 14, 59, 50), now)).toBe('Just now');
  });
  it('says Today / Yesterday with the time', () => {
    expect(formatDateTime(new Date(2026, 8, 26, 9, 5), now)).toMatch(/^Today /);
    expect(formatDateTime(new Date(2026, 8, 25, 23, 0), now)).toMatch(/^Yesterday /);
  });
  it('handles empty and invalid input', () => {
    expect(formatDateTime(null, now)).toBe('—');
    expect(formatDateTime('not a date', now)).toBe('not a date');
  });
});

import { shortModelName } from './format';
describe('shortModelName', () => {
  it('strips quantisation, container and instruct suffixes', () => {
    expect(shortModelName('Qwen3-VL-4B-Instruct-GGUF')).toBe('Qwen3-VL-4B');
    expect(shortModelName('Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf')).toBe('Qwen2.5-VL-7B');
    expect(shortModelName('bge-m3')).toBe('bge-m3');
  });
});
