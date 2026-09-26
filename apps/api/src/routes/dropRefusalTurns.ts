import type { WorkingMemoryTurn } from '../memory/working.js';

const REFUSAL_PREFIX = "I couldn't find any documents in this project that support an answer";

const TIME_REFUSAL = /^(i (can[’']?t|cannot|don[’']?t have)|sorry).{0,80}(real-time|current time|the time|clock|date and time)/i;

/** Removes stale doc-QA refusals (and the question they answered) so a model never imitates them. */
export function dropRefusalTurns(turns: WorkingMemoryTurn[]): WorkingMemoryTurn[] {
  const out: WorkingMemoryTurn[] = [];
  for (const turn of turns) {
    if (turn.role === 'assistant' && (turn.content.startsWith(REFUSAL_PREFIX) || TIME_REFUSAL.test(turn.content.trim()))) {
      if (out[out.length - 1]?.role === 'user') out.pop();
      continue;
    }
    out.push(turn);
  }
  return out;
}
