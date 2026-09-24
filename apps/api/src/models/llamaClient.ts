import type { ChatMessage } from './types.js';

/**
 * Thin client for llama-server's OpenAI-compatible HTTP API. Retries with
 * exponential backoff on 5xx; timeouts via AbortController. Does not know
 * about policy or spans — gateway.ts wraps every call with can() + writeSpan.
 */
export interface LlamaChatOptions {
  endpoint: string;
  messages: ChatMessage[];
  tools?: unknown[];
  jsonSchema?: Record<string, unknown>;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  /** Aborts the in-flight request (client disconnected / user pressed Stop). */
  signal?: AbortSignal;
  /** When set, the reply is streamed and each text delta is reported here (tool calls are still assembled). */
  onToken?: (delta: string) => void;
}

export interface LlamaToolCall {
  id: string;
  name: string;
  arguments: string; // raw JSON string, as the model emits it
}

export interface LlamaChatResult {
  content: string;
  tokensIn: number;
  tokensOut: number;
  toolCalls: LlamaToolCall[];
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reads llama-server's SSE chat stream, reporting text deltas and assembling tool calls + usage. */
async function readStreamedChat(res: Response, onToken: (delta: string) => void): Promise<LlamaChatResult> {
  if (!res.body) throw new Error('llama-server returned no body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let deltas = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  const calls = new Map<number, { id: string; name: string; arguments: string }>();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{
            delta?: {
              content?: string | null;
              tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>;
            };
          }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        if (json.usage) {
          tokensIn = json.usage.prompt_tokens ?? tokensIn;
          tokensOut = json.usage.completion_tokens ?? tokensOut;
        }
        const delta = json.choices?.[0]?.delta;
        if (delta?.content) {
          content += delta.content;
          deltas += 1;
          onToken(delta.content);
        }
        for (const tc of delta?.tool_calls ?? []) {
          const idx = tc.index ?? 0;
          const existing = calls.get(idx) ?? { id: '', name: '', arguments: '' };
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name += tc.function.name;
          if (tc.function?.arguments) existing.arguments += tc.function.arguments;
          calls.set(idx, existing);
        }
      } catch {
        // ignore malformed SSE lines from the model server
      }
    }
  }
  return {
    content,
    tokensIn,
    tokensOut: tokensOut || deltas,
    toolCalls: [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c),
  };
}

export async function llamaChat(opts: LlamaChatOptions): Promise<LlamaChatResult> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const maxRetries = opts.maxRetries ?? 2;

  let lastError: unknown;
  let streamedAny = false;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${opts.endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: opts.signal ? AbortSignal.any([controller.signal, opts.signal]) : controller.signal,
        body: JSON.stringify({
          messages: opts.messages,
          max_tokens: opts.maxTokens,
          tools: opts.tools,
          response_format: opts.jsonSchema
            ? { type: 'json_schema', json_schema: opts.jsonSchema }
            : undefined,
          stream: opts.onToken ? true : false,
          ...(opts.onToken ? { stream_options: { include_usage: true } } : {}),
        }),
      });
      clearTimeout(timer);

      if (res.status >= 500) {
        throw new Error(`llama-server ${res.status}`);
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`llama-server ${res.status}: ${body}`);
      }

      if (opts.onToken) {
        return await readStreamedChat(res, (delta) => {
          streamedAny = true;
          opts.onToken?.(delta);
        });
      }

      const json = (await res.json()) as {
        choices: Array<{
          message: {
            content: string | null;
            tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
          };
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const message = json.choices[0]?.message;
      return {
        content: message?.content ?? '',
        tokensIn: json.usage?.prompt_tokens ?? 0,
        tokensOut: json.usage?.completion_tokens ?? 0,
        toolCalls: (message?.tool_calls ?? []).map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        })),
      };
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      // Retrying after tokens were already shown would duplicate them.
      if (opts.signal?.aborted || streamedAny) throw err;
      if (attempt < maxRetries) {
        await sleep(2 ** attempt * 250);
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('llama-server call failed');
}

export async function* llamaChatStream(opts: LlamaChatOptions): AsyncGenerator<string> {
  const res = await fetch(`${opts.endpoint}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: opts.signal,
    body: JSON.stringify({
      messages: opts.messages,
      max_tokens: opts.maxTokens,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`llama-server ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data) as { choices: Array<{ delta?: { content?: string } }> };
        const delta = json.choices[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // ignore malformed SSE lines from the model server
      }
    }
  }
}

export async function llamaEmbed(endpoint: string, texts: string[]): Promise<number[][]> {
  const res = await fetch(`${endpoint}/v1/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: texts }),
  });
  if (!res.ok) throw new Error(`llama-server embed ${res.status}`);
  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return json.data.map((d) => d.embedding);
}

/**
 * llama-server's /v1/rerank response is `{ results: [{index, relevance_score}] }`
 * with `relevance_score` a raw (unbounded, often negative) logit, not a 0-1
 * score — confirmed live against bge-reranker-v2-m3 (relevant chunks scored
 * around -2 to -3, an irrelevant one around -11). Callers threshold on the
 * raw scale, not a normalized one.
 */
export async function llamaRerank(
  endpoint: string,
  query: string,
  documents: string[],
): Promise<number[]> {
  const res = await fetch(`${endpoint}/v1/rerank`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, documents }),
  });
  if (!res.ok) throw new Error(`llama-server rerank ${res.status}`);
  const json = (await res.json()) as {
    results: Array<{ index: number; relevance_score: number }>;
  };
  const scores = new Array<number>(documents.length).fill(-Infinity);
  for (const r of json.results) scores[r.index] = r.relevance_score;
  return scores;
}

export async function llamaTokenize(endpoint: string, text: string): Promise<number[]> {
  const res = await fetch(`${endpoint}/tokenize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: text }),
  });
  if (!res.ok) throw new Error(`llama-server tokenize ${res.status}`);
  const json = (await res.json()) as { tokens: number[] };
  return json.tokens;
}
