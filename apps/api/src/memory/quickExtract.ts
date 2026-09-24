import type { Db } from '../db/client.js';
import type { ModelGateway, SpanWriter } from '../models/gateway.js';
import type { AuthedUser } from '../policy/types.js';
import { extractCandidates, storeCandidates } from './extraction.js';
import type { SavedMemory } from './types.js';

/**
 * Learns from one message right away (instead of waiting for the idle sweep),
 * so a fact the user just stated is recallable in the very next chat.
 * Never throws: memory must not break answering.
 */
export async function quickExtract(
  deps: { db: Db; gateway: ModelGateway; spanWriter: SpanWriter; user: AuthedUser; traceId: string; signal?: AbortSignal },
  conversation: { id: string; projectId: string; workspaceId: string },
  message: string,
): Promise<SavedMemory[]> {
  const started = Date.now();
  try {
    const { candidates, failed } = await extractCandidates(
      { gateway: deps.gateway, user: deps.user, traceId: deps.traceId, signal: deps.signal },
      message,
    );
    const saved = failed ? [] : await storeCandidates(deps, candidates, conversation);
    await deps.spanWriter.writeSpan({
      traceId: deps.traceId,
      kind: 'memory',
      name: 'memory.quick_extract',
      latencyMs: Date.now() - started,
      status: failed ? 'error' : 'ok',
      attrs: { candidateCount: candidates.length, stored: saved.length },
    });
    return saved;
  } catch {
    return [];
  }
}
