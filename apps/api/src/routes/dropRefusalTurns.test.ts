import { describe, expect, it } from 'vitest';
import { dropRefusalTurns } from './dropRefusalTurns.js';

describe('dropRefusalTurns', () => {
  it('removes a refusal and its question, keeps the rest', () => {
    const turns = [
      { role: 'user' as const, content: 'hi' },
      { role: 'assistant' as const, content: 'hello' },
      { role: 'user' as const, content: 'who is pm of india' },
      { role: 'assistant' as const, content: "I couldn't find any documents in this project that support an answer to that question." },
    ];
    expect(dropRefusalTurns(turns)).toEqual(turns.slice(0, 2));
  });
});

describe('time refusals', () => {
  it('drops an old "I can\'t check the time" answer and its question', () => {
    const out = dropRefusalTurns([
      { role: 'user', content: 'what is time now' },
      { role: 'assistant', content: "I can’t access real-time data or check the current time." },
      { role: 'user', content: 'hi' },
    ]);
    expect(out).toEqual([{ role: 'user', content: 'hi' }]);
  });
});
