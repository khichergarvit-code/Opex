import type { ChatMessage } from './types.js';

/** A generous estimate (chars / 3): over-counting only trims a little early, under-counting overflows the model's window. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

const TOKENS_PER_IMAGE = 1200;
const TOKENS_PER_MESSAGE = 8;

export function messageTokens(m: ChatMessage): number {
  const calls = m.tool_calls ? estimateTokens(JSON.stringify(m.tool_calls)) : 0;
  return estimateTokens(m.content) + calls + (m.images?.length ?? 0) * TOKENS_PER_IMAGE + TOKENS_PER_MESSAGE;
}

export function totalTokens(messages: ChatMessage[]): number {
  return messages.reduce((n, m) => n + messageTokens(m), 0);
}

export interface FitResult {
  messages: ChatMessage[];
  droppedChunks: number;
  droppedMemories: number;
  droppedTurns: number;
  truncated: boolean;
  trimmed: boolean;
  tokensBefore: number;
  tokensAfter: number;
}

const BLOCK = (tag: string) => new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>\\s*`, 'g');

/** Removes the LAST matching block (lowest ranked, since blocks are ordered best-first) from the newest user message. */
function dropLastBlock(messages: ChatMessage[], tag: string, keep: number): boolean {
  const idx = messages.map((m) => m.role).lastIndexOf('user');
  const target = messages[idx];
  if (!target) return false;
  const matches = target.content.match(BLOCK(tag));
  if (!matches || matches.length <= keep) return false;
  const last = matches[matches.length - 1]!;
  const at = target.content.lastIndexOf(last);
  messages[idx] = { ...target, content: target.content.slice(0, at) + target.content.slice(at + last.length) };
  return true;
}

/**
 * Makes a prompt fit the model's window without an overflow error, dropping the least valuable
 * material first: lowest-ranked retrieved chunks, then the oldest plain chat turns, then
 * lowest-ranked memories, and only as a last resort the middle of the newest question.
 * System messages and the newest user message are never dropped.
 */
export function fitToContext(input: ChatMessage[], budgetTokens: number): FitResult {
  const messages = input.map((m) => ({ ...m }));
  const tokensBefore = totalTokens(messages);
  const result: FitResult = {
    messages,
    droppedChunks: 0,
    droppedMemories: 0,
    droppedTurns: 0,
    truncated: false,
    trimmed: false,
    tokensBefore,
    tokensAfter: tokensBefore,
  };
  if (budgetTokens <= 0 || tokensBefore <= budgetTokens) return result;

  const over = () => totalTokens(messages) > budgetTokens;

  while (over() && dropLastBlock(messages, 'retrieved_chunk', 2)) result.droppedChunks++;

  while (over()) {
    const newestUser = messages.map((m) => m.role).lastIndexOf('user');
    const i = messages.findIndex((m, idx) => idx < newestUser && (m.role === 'user' || m.role === 'assistant') && !m.tool_calls);
    if (i === -1) break;
    messages.splice(i, 1);
    result.droppedTurns++;
  }

  while (over() && dropLastBlock(messages, 'memory', 0)) result.droppedMemories++;
  while (over() && dropLastBlock(messages, 'retrieved_chunk', 1)) result.droppedChunks++;

  if (over()) {
    const idx = messages.map((m) => m.role).lastIndexOf('user');
    const target = messages[idx];
    if (target) {
      const excess = totalTokens(messages) - budgetTokens;
      const keepChars = Math.max(200, target.content.length - excess * 3 - 40);
      const head = Math.ceil(keepChars * 0.6);
      const tail = keepChars - head;
      messages[idx] = { ...target, content: `${target.content.slice(0, head)}\n…[shortened to fit the model's context window]…\n${target.content.slice(target.content.length - tail)}` };
      result.truncated = true;
    }
  }

  result.tokensAfter = totalTokens(messages);
  result.trimmed = result.droppedChunks + result.droppedMemories + result.droppedTurns > 0 || result.truncated;
  return result;
}
