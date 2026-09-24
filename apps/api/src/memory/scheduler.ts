import { and, isNull, lt, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { memories } from '../db/schema/index.js';
import { loadActivePolicyRules } from '../policy/loadPolicyRules.js';
import type { ModelGateway, SpanWriter } from '../models/gateway.js';
import { runExtractionForConversation } from './extraction.js';

// Short: the immediate per-message path handles explicit statements; this sweep is the safety net.
const IDLE_MINUTES = 5;
const MAX_FAILURES = 5;

async function extractIdleConversations(db: Db, gateway: ModelGateway, spanWriter: SpanWriter): Promise<void> {
  const cutoff = new Date(Date.now() - IDLE_MINUTES * 60_000).toISOString();
  const idle = await db.execute(sql`
    SELECT id FROM conversations
    WHERE updated_at < ${cutoff}
      AND memory_extract_failures < ${MAX_FAILURES}
      AND (memory_extracted_at IS NULL OR memory_extracted_at < updated_at)
    ORDER BY updated_at DESC
    LIMIT 25
  `);
  for (const row of idle as unknown as Array<{ id: string }>) {
    // A failure (model down) leaves the conversation queued for the next tick; one conversation
    // failing shouldn't stop the sweep.
    const ok = await runExtractionForConversation({ db, gateway, spanWriter }, row.id).catch(() => false);
    if (!ok) break; // the model is likely down: stop hammering it until the next tick
  }
}

/** memory.md: "Admins set a TTL per type and workspace, enforced by a nightly purge." Soft-deletes, doesn't hard-remove (keeps the version/audit trail intact). */
async function purgeExpiredMemories(db: Db): Promise<void> {
  const workspaceRows = await db.execute(sql`SELECT DISTINCT workspace_id FROM memories WHERE deleted_at IS NULL`);
  for (const row of workspaceRows as unknown as Array<{ workspace_id: string }>) {
    const rules = await loadActivePolicyRules(db, row.workspace_id);
    for (const type of ['episodic', 'semantic'] as const) {
      const ttlDays = rules.memoryTtlDays[type];
      if (ttlDays === null || ttlDays === undefined) continue;
      await db
        .update(memories)
        .set({ deletedAt: new Date() })
        .where(
          and(
            isNull(memories.deletedAt),
            sql`${memories.workspaceId} = ${row.workspace_id}`,
            sql`${memories.type} = ${type}`,
            lt(memories.createdAt, new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000)),
          ),
        );
    }
  }
}

/**
 * B2's extraction + TTL purge, run as an in-process interval started once
 * from index.ts — not a new worker container. B2's workload (extract from
 * idle conversations every few minutes, purge nightly-ish) is too light
 * to justify duplicating services/ingest's container-worker pattern.
 * Returns a stop function for tests/shutdown.
 */
export function startMemoryScheduler(
  db: Db,
  gateway: ModelGateway,
  spanWriter: SpanWriter,
  intervalMs = 5 * 60_000,
): () => void {
  const interval = setInterval(() => {
    extractIdleConversations(db, gateway, spanWriter)
      .then(() => purgeExpiredMemories(db))
      .catch((err) => console.error('memory scheduler tick failed:', err));
  }, intervalMs);
  return () => clearInterval(interval);
}

// Exported for the eval suite's debug endpoint (deterministic extraction
// without waiting 30 real minutes) and for tests.
export { extractIdleConversations, purgeExpiredMemories };
