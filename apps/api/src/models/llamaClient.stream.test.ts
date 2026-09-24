import { afterEach, describe, expect, it, vi } from 'vitest';
import { llamaChat } from './llamaClient.js';

function sse(chunks: unknown[]): Response {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('llamaChat with onToken (streamed tool-calling chat)', () => {
  it('reports text deltas as they arrive and returns the joined content and usage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sse([
          { choices: [{ delta: { content: 'The torque ' } }] },
          { choices: [{ delta: { content: 'is 460 Nm.' } }] },
          { choices: [], usage: { prompt_tokens: 12, completion_tokens: 7 } },
        ]),
      ),
    );
    const seen: string[] = [];
    const result = await llamaChat({ endpoint: 'http://x', messages: [], onToken: (d) => seen.push(d) });
    expect(seen).toEqual(['The torque ', 'is 460 Nm.']);
    expect(result).toMatchObject({ content: 'The torque is 460 Nm.', tokensIn: 12, tokensOut: 7, toolCalls: [] });
  });

  it('assembles a tool call whose arguments arrive in pieces', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sse([
          { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'doc_search', arguments: '{"q":' } }] } }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"torque"}' } }] } }] },
        ]),
      ),
    );
    const seen: string[] = [];
    const result = await llamaChat({ endpoint: 'http://x', messages: [], onToken: (d) => seen.push(d) });
    expect(seen).toEqual([]);
    expect(result.toolCalls).toEqual([{ id: 'call_1', name: 'doc_search', arguments: '{"q":"torque"}' }]);
  });

  it('does not retry (and duplicate tokens) once text has been streamed', async () => {
    const fetchMock = vi.fn(async () => {
      let pulls = 0;
      const stream = new ReadableStream({
        pull(controller) {
          pulls += 1;
          if (pulls === 1) {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'hi' } }] })}\n\n`));
          } else {
            controller.error(new Error('connection reset'));
          }
        },
      });
      return new Response(stream, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(llamaChat({ endpoint: 'http://x', messages: [], onToken: () => {} })).rejects.toThrow('connection reset');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
