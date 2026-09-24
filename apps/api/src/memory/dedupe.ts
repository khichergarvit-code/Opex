import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import type { ModelGateway } from '../models/gateway.js';
import type { AuthedUser } from '../policy/types.js';
import { memories } from '../db/schema/index.js';
import type { MemoryCandidate, SavedMemory } from './types.js';

const SIMILARITY_THRESHOLD = 0.9;
const CONFLICT_LOWER_BOUND = 0.6;

const REPLACES_SCHEMA = {
  name: 'replaces',
  schema: { type: 'object', properties: { replaces: { type: 'boolean' } }, required: ['replaces'] },
};

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
): Promise<SavedMemory | null> {
  const [embedding] = await deps.gateway.embed({ texts: [candidate.text], user: deps.user, traceId: deps.traceId });
  if (!embedding) return null;
  const vectorLiteral = toPgVectorLiteral(embedding);

  const existing = await deps.db.execute(sql`
    SELECT id FROM memories
    WHERE deleted_at IS NULL AND user_id = ${ctx.userId} AND scope = ${candidate.scope} AND embedding IS NOT NULL
      AND 1 - (embedding <=> ${vectorLiteral}::vector) > ${SIMILARITY_THRESHOLD}
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT 1
  `);
  let existingRow = (existing as unknown as Array<{ id: string }>)[0];

  // A similar-but-not-identical fact ("works as a DevOps engineer" vs "works as a data scientist")
  // may contradict an older one: ask the model once whether the new statement replaces it.
  if (!existingRow && candidate.type === 'semantic' && candidate.scope === 'user') {
    const neighbour = (await deps.db.execute(sql`
      SELECT id, text FROM memories
      WHERE deleted_at IS NULL AND user_id = ${ctx.userId} AND scope = 'user' AND type = 'semantic' AND embedding IS NOT NULL
        AND 1 - (embedding <=> ${vectorLiteral}::vector) > ${CONFLICT_LOWER_BOUND}
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT 1
    `)) as unknown as Array<{ id: string; text: string }>;
    const near = neighbour[0];
    if (near && (await judgeReplacement(deps, near.text, candidate.text))) existingRow = { id: near.id };
  }

  return deps.db.transaction(async (tx) => {
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
    return inserted ? { id: inserted.id, text: candidate.text } : null;
  });
}

async function judgeReplacement(
  deps: { gateway: ModelGateway; user: AuthedUser; traceId: string },
  oldText: string,
  newText: string,
): Promise<boolean> {
  try {
    const res = await deps.gateway.chat({
      role: 'general',
      messages: [
        {
          role: 'system',
          content:
            'Decide whether a NEW statement about a user replaces an OLD one (same subject, the facts cannot both be true now, e.g. a changed job or preference). Answer {"replaces": true} only if the new statement makes the old one outdated; otherwise {"replaces": false}.',
        },
        { role: 'user', content: `OLD: ${oldText}\nNEW: ${newText}` },
      ],
      jsonSchema: REPLACES_SCHEMA,
      user: deps.user,
      traceId: deps.traceId,
      budget: { maxTokens: 20 },
    });
    return (JSON.parse(res.content) as { replaces?: boolean }).replaces === true;
  } catch {
    return false;
  }
}
