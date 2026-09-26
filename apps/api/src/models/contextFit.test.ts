import { describe, expect, it } from 'vitest';
import type { ChatMessage } from './types.js';
import { estimateTokens, fitToContext, totalTokens } from './contextFit.js';

const msg = (role: ChatMessage['role'], content: string): ChatMessage => ({ role, content });
const chunk = (i: number, size = 900) => `<retrieved_chunk index="${i}" document="d.pdf" page="1" suspicious="false">\n${'x'.repeat(size)}\n</retrieved_chunk>`;

describe('fitToContext', () => {
  it('leaves a prompt that already fits untouched', () => {
    const r = fitToContext([msg('system', 'sys'), msg('user', 'hi')], 1000);
    expect(r.trimmed).toBe(false);
    expect(r.messages).toHaveLength(2);
  });

  it('drops the lowest-ranked retrieved chunks first, keeping the best ones in order', () => {
    const chunks = [1, 2, 3, 4, 5, 6].map((i) => chunk(i)).join('\n\n');
    const messages = [msg('system', 'sys'), msg('user', `${chunks}\n\nQuestion: torque?`)];
    const r = fitToContext(messages, 1200);
    expect(r.droppedChunks).toBeGreaterThan(0);
    expect(r.messages[1]!.content).toContain('index="1"');
    expect(r.messages[1]!.content).not.toContain('index="6"');
    expect(r.messages[1]!.content).toContain('Question: torque?');
    expect(totalTokens(r.messages)).toBeLessThanOrEqual(1200);
  });

  it('then drops the oldest plain turns, never the system prompt or the newest question', () => {
    const history = Array.from({ length: 10 }, (_, i) => msg(i % 2 ? 'assistant' : 'user', `turn ${i} ${'y'.repeat(600)}`));
    const messages = [msg('system', 'sys'), ...history, msg('user', 'the latest question')];
    const r = fitToContext(messages, 900);
    expect(r.droppedTurns).toBeGreaterThan(0);
    expect(r.messages[0]!.content).toBe('sys');
    expect(r.messages.at(-1)!.content).toBe('the latest question');
    expect(r.messages.some((m) => m.content.startsWith('turn 0'))).toBe(false);
  });

  it('does not orphan tool-call turns', () => {
    const messages: ChatMessage[] = [
      msg('system', 'sys'),
      { role: 'assistant', content: '', tool_calls: [{ id: '1', type: 'function', function: { name: 'x', arguments: '{}' } }] },
      { role: 'tool', content: 'result', tool_call_id: '1' },
      msg('user', 'z'.repeat(6000)),
    ];
    const r = fitToContext(messages, 500);
    expect(r.messages.filter((m) => m.role === 'tool')).toHaveLength(1);
  });

  it('shortens the newest question only as a last resort and says so', () => {
    const r = fitToContext([msg('system', 's'), msg('user', 'q'.repeat(9000))], 800);
    expect(r.truncated).toBe(true);
    expect(r.messages[1]!.content).toContain('shortened to fit');
    expect(totalTokens(r.messages)).toBeLessThanOrEqual(850);
  });

  it('estimates conservatively', () => {
    expect(estimateTokens('abcdef')).toBe(2);
  });
});
