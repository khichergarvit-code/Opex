import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { conversations, messages, traces, users } from '../db/schema/index.js';
import type { ModelGateway, SpanWriter } from '../models/gateway.js';
import type { AuthedUser } from '../policy/types.js';
import { computeSourceClassification } from './classification.js';
import { dedupeAndStore } from './dedupe.js';
import { containsSecretOrPii } from './piiFilter.js';
import type { MemoryCandidate } from './types.js';

const MEMORY_EXTRACT_SCHEMA = {
  name: 'memory_candidates',
  schema: {
    type: 'object',
    properties: {
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            type: { type: 'string', enum: ['episodic', 'semantic'] },
            scope: { type: 'string', enum: ['user', 'project', 'workspace'] },
            confidence: { type: 'number' },
          },
          required: ['text', 'type', 'scope', 'confidence'],
        },
      },
    },
    required: ['candidates'],
  },
};

const memoryCandidatesSchema = z.object({
  candidates: z.array(
    z.object({
      text: z.string(),
      type: z.enum(['episodic', 'semantic']),
      scope: z.enum(['user', 'project', 'workspace']),
      confidence: z.number(),
    }),
  ),
});

const EXTRACT_SYSTEM_PROMPT = `Read this conversation transcript and extract candidate long-term memories per memory.md:
- episodic: what happened this conversation (goal, actions, outcome, entities) — scope is usually "user".
- semantic: a durable fact or preference worth remembering across future conversations — scope is "user" unless it's clearly project- or workspace-wide.
Only extract things worth remembering later; most turns produce nothing. Return {candidates: []} if there's nothing worth keeping. confidence is 0-1, how sure you are this is a genuine, durable preference/fact/outcome, not small talk.`;

/**
 * One JSON-schema-constrained + Zod-validated LLM call per idle/closed
 * conversation, same pattern as router.ts's classification call.
 * Fail-safe-closed: a parse failure or model error extracts nothing
 * rather than crashing the scheduler that calls this.
 */
export async function extractCandidates(
  deps: { gateway: ModelGateway; user: AuthedUser; traceId: string },
  transcript: string,
): Promise<MemoryCandidate[]> {
  try {
    const result = await deps.gateway.chat({
      role: 'general',
      messages: [
        { role: 'system', content: EXTRACT_SYSTEM_PROMPT },
        { role: 'user', content: transcript },
      ],
      jsonSchema: MEMORY_EXTRACT_SCHEMA,
      user: deps.user,
      traceId: deps.traceId,
    });
    const parsed = memoryCandidatesSchema.safeParse(JSON.parse(result.content));
    if (!parsed.success) return [];
    // memory.md steps 2-3: drop secrets/PII and low-confidence candidates.
    return parsed.data.candidates.filter((c) => c.confidence >= 0.6 && !containsSecretOrPii(c.text));
  } catch {
    return [];
  }
}

/**
 * The extraction scheduler's per-conversation entrypoint: loads the
 * conversation + its messages, extracts candidates, dedupes/stores each
 * one, and marks the conversation as extracted. Runs as the conversation's
 * own owning user (extraction is inherently "on behalf of" that user —
 * memory.md's episodic/semantic types default to scope:'user').
 */
export async function runExtractionForConversation(
  deps: { db: Db; gateway: ModelGateway; spanWriter: SpanWriter },
  conversationId: string,
): Promise<void> {
  const [conversation] = await deps.db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (!conversation) return;
  const [userRow] = await deps.db.select().from(users).where(eq(users.id, conversation.userId)).limit(1);
  if (!userRow || userRow.status !== 'active') return;
  const user: AuthedUser = {
    id: userRow.id,
    email: userRow.email,
    role: userRow.role,
    clearance: userRow.clearance as 0 | 1 | 2 | 3,
    status: userRow.status,
  };

  const messageRows = await deps.db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  if (messageRows.length === 0) {
    await deps.db.update(conversations).set({ memoryExtractedAt: new Date() }).where(eq(conversations.id, conversationId));
    return;
  }
  const transcript = messageRows.map((m) => `${m.role}: ${m.content}`).join('\n');

  const [trace] = await deps.db.insert(traces).values({ userId: user.id }).returning();
  if (!trace) return;
  const started = Date.now();
  const candidates = await extractCandidates({ gateway: deps.gateway, user, traceId: trace.id }, transcript);

  const classification = await computeSourceClassification(deps.db, conversationId, conversation.projectId);
  for (const candidate of candidates) {
    await dedupeAndStore(
      { db: deps.db, gateway: deps.gateway, user, traceId: trace.id },
      candidate,
      {
        userId: user.id,
        projectId: candidate.scope === 'project' ? conversation.projectId : null,
        workspaceId: conversation.workspaceId,
        classification,
        sourceConversationId: conversationId,
        sourceTraceId: trace.id,
      },
    );
  }

  await deps.spanWriter.writeSpan({
    traceId: trace.id,
    kind: 'memory',
    name: 'memory.extract',
    latencyMs: Date.now() - started,
    status: 'ok',
    attrs: { candidateCount: candidates.length, conversationId },
  });
  await deps.db.update(conversations).set({ memoryExtractedAt: new Date() }).where(eq(conversations.id, conversationId));
}
