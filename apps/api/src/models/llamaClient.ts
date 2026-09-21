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
}

export interface LlamaChatResult {
  content: string;
  tokensIn: number;
  tokensOut: number;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function llamaChat(opts: LlamaChatOptions): Promise<LlamaChatResult> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const maxRetries = opts.maxRetries ?? 2;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${opts.endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: opts.messages,
          max_tokens: opts.maxTokens,
          tools: opts.tools,
          response_format: opts.jsonSchema
            ? { type: 'json_schema', json_schema: opts.jsonSchema }
            : undefined,
          stream: false,
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

      const json = (await res.json()) as {
        choices: Array<{ message: { content: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      return {
        content: json.choices[0]?.message.content ?? '',
        tokensIn: json.usage?.prompt_tokens ?? 0,
        tokensOut: json.usage?.completion_tokens ?? 0,
      };
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
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
