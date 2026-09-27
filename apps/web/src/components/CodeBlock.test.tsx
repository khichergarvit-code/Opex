import { describe, expect, it } from 'vitest';
import { splitContentSegments } from './CodeBlock';

describe('splitContentSegments', () => {
  it('returns a single text segment for plain prose', () => {
    expect(splitContentSegments('just some text')).toEqual([{ kind: 'text', text: 'just some text' }]);
  });

  it('splits prose around a fenced code block and picks up the language tag', () => {
    const out = splitContentSegments('before\n```python\nprint(1)\n```\nafter');
    expect(out).toEqual([
      { kind: 'text', text: 'before\n' },
      { kind: 'code', text: 'print(1)', lang: 'python' },
      { kind: 'text', text: '\nafter' },
    ]);
  });

  it('handles a fence with no language tag', () => {
    const out = splitContentSegments('```\nls -la\n```');
    expect(out).toEqual([{ kind: 'code', text: 'ls -la', lang: '' }]);
  });

  it('treats an unclosed trailing fence as code (still streaming in)', () => {
    const out = splitContentSegments('here:\n```js\nconst x = 1;');
    expect(out).toEqual([
      { kind: 'text', text: 'here:\n' },
      { kind: 'code', text: 'const x = 1;', lang: 'js' },
    ]);
  });

  it('handles multiple code blocks', () => {
    const out = splitContentSegments('a\n```\none\n```\nb\n```\ntwo\n```\nc');
    expect(out.map((s) => s.kind)).toEqual(['text', 'code', 'text', 'code', 'text']);
    expect(out.filter((s) => s.kind === 'code').map((s) => s.text)).toEqual(['one', 'two']);
  });

  it('does not empty-segment when content starts with a fence', () => {
    const out = splitContentSegments('```sql\nselect 1;\n```');
    expect(out).toEqual([{ kind: 'code', text: 'select 1;', lang: 'sql' }]);
  });
});
