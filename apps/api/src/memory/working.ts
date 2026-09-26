import { readFile } from 'node:fs/promises';
import type { ModelGateway } from '../models/gateway.js';
import type { AuthedUser } from '../policy/types.js';

const FOLD_PROMPT_PATH = new URL('../prompts/working-memory-fold.md', import.meta.url);

// Interim numbers for A3 (memory.md's full multi-source budget assumes B2
// long-term memory exists too — this is a reduced, working-memory-only
// version, tuned against llm-main's 16384 ctx_len). See the plan's §7.
const WORKING_MEMORY_BUDGET_TOKENS = 2000;
const FOLD_THRESHOLD = 0.6;
const RECENT_TURNS_KEPT = 6;

export interface WorkingMemoryTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface WorkingMemoryResult {
  /** The folded summary, if a fold happened this call — persist it to conversations.working_summary. */
  summary: string | null;
  /** Turns to actually send to the model: the summary (if any) plus recent raw turns. */
  recentTurns: WorkingMemoryTurn[];
  folded: boolean;
}

/** Fast word-count heuristic, not exact BPE — fine for a budget *trigger*, not an exact limit. */
function approxTokenCount(text: string): number {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.3);
}

function renderFoldInput(existingSummary: string | null, olderTurns: WorkingMemoryTurn[]): string {
  const summaryBlock = existingSummary ? `Existing summary:\n${existingSummary}\n\n` : '';
  const turnsBlock = olderTurns.map((t) => `${t.role}: ${t.content}`).join('\n');
  return `${summaryBlock}New turns to fold in:\n${turnsBlock}`;
}

export interface GetWorkingMemoryDeps {
  gateway: ModelGateway;
  user: AuthedUser;
  traceId: string;
  signal?: AbortSignal;
}

/**
 * Working memory (A3): last-N turns + a rolling summary. Folds the oldest
 * turns into the summary once history exceeds 60% of the budget.
 */
export async function getWorkingMemory(
  deps: GetWorkingMemoryDeps,
  history: WorkingMemoryTurn[],
  existingSummary: string | null,
): Promise<WorkingMemoryResult> {
  const historyTokens = history.reduce((sum, t) => sum + approxTokenCount(t.content), 0);
  const summaryTokens = existingSummary ? approxTokenCount(existingSummary) : 0;
  const totalTokens = historyTokens + summaryTokens;

  const overBudget = totalTokens > WORKING_MEMORY_BUDGET_TOKENS * FOLD_THRESHOLD;
  if (!overBudget || history.length <= RECENT_TURNS_KEPT || deps.signal?.aborted) {
    return { summary: existingSummary, recentTurns: history, folded: false };
  }

  const cutoff = history.length - RECENT_TURNS_KEPT;
  const older = history.slice(0, cutoff);
  const recent = history.slice(cutoff);

  const foldPrompt = await readFile(FOLD_PROMPT_PATH, 'utf8');
  const result = await deps.gateway.chat({
    role: 'general',
    messages: [
      { role: 'system', content: foldPrompt },
      { role: 'user', content: renderFoldInput(existingSummary, older) },
    ],
    user: deps.user,
    traceId: deps.traceId,
    signal: deps.signal,
  });

  return { summary: result.content, recentTurns: recent, folded: true };
}
