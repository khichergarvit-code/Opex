import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import type { ModelGateway } from '../models/gateway.js';
import type { AuthedUser } from '../policy/types.js';
import { memories } from '../db/schema/index.js';
import type { MemoryCandidate } from './types.js';

const SIMILARITY_THRESHOLD = 0.9;

function toPgVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

export interface DedupeContext {
  userId: string;
  projectId: string | null;
  workspaceId: string;
  classification: number;
  sourceConversationId: string;
  sourceTraceId: string;
}

/**
 * memory.md step 4: "Dedupe: if cosine similarity is above 0.9, merge
 * with or supersede the existing memory, keeping versions." The old row
 * is soft-deleted (deletedAt), not removed — supersedesId keeps the
 * version chain, same `<=>` operator convention as vectorSearch.ts.
 */
export async function dedupeAndStore(
  deps: { db: Db; gateway: ModelGateway; user: AuthedUser; traceId: string },
  candidate: MemoryCandidate,
  ctx: DedupeContext,
): Promise<void> {
  const [embedding] = await deps.gateway.embed({ texts: [candidate.text], user: deps.user, traceId: deps.traceId });
  if (!embedding) return;
  const vectorLiteral = toPgVectorLiteral(embedding);

  const existing = await deps.db.execute(sql`
    SELECT id FROM memories
    WHERE deleted_at IS NULL AND user_id = ${ctx.userId} AND scope = ${candidate.scope} AND embedding IS NOT NULL
      AND 1 - (embedding <=> ${vectorLiteral}::vector) > ${SIMILARITY_THRESHOLD}
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT 1
  `);
  const existingRow = (existing as unknown as Array<{ id: string }>)[0];

  await deps.db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(memories)
      .values({
        workspaceId: ctx.workspaceId,
        projectId: ctx.projectId,
        userId: ctx.userId,
        type: candidate.type,
        scope: candidate.scope,
        text: candidate.text,
        embedding,
        confidence: candidate.confidence,
        classification: ctx.classification,
        sourceKind: 'conversation',
        sourceConversationId: ctx.sourceConversationId,
        sourceTraceId: ctx.sourceTraceId,
        supersedesId: existingRow?.id ?? null,
      })
      .returning({ id: memories.id });
    if (existingRow && inserted) {
      await tx.update(memories).set({ deletedAt: new Date() }).where(eq(memories.id, existingRow.id));
    }
  });
}
