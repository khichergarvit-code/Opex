import { readFile } from 'node:fs/promises';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { conversations, messages, traces, users } from '../db/schema/index.js';
import type { ModelGateway, SpanWriter } from '../models/gateway.js';
import type { AuthedUser } from '../policy/types.js';
import { computeSourceClassification } from './classification.js';
import { dedupeAndStore } from './dedupe.js';
import { containsSecretOrPii } from './piiFilter.js';
import { isExplicitRemember, isWorthKeeping } from './qualityFilter.js';
import type { MemoryCandidate, SavedMemory } from './types.js';

const EXTRACT_PROMPT_PATH = new URL('../prompts/memory-extract.md', import.meta.url);

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

export interface ExtractionResult {
  candidates: MemoryCandidate[];
  /** True when the model could not be reached or returned nothing parseable — the caller must retry, not treat it as "nothing to remember". */
  failed: boolean;
}

/**
 * One JSON-schema-constrained + Zod-validated LLM call over the user's own
 * messages (never assistant text). A model error is reported as `failed`,
 * distinct from a genuine empty result, so the scheduler can retry.
 */
export async function extractCandidates(
  deps: { gateway: ModelGateway; user: AuthedUser; traceId: string; signal?: AbortSignal },
  userText: string,
): Promise<ExtractionResult> {
  try {
    const prompt = await readFile(EXTRACT_PROMPT_PATH, 'utf8');
    const result = await deps.gateway.chat({
      role: 'general',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: userText },
      ],
      jsonSchema: MEMORY_EXTRACT_SCHEMA,
      user: deps.user,
      traceId: deps.traceId,
      signal: deps.signal,
      budget: { maxTokens: 400 },
    });
    const parsed = memoryCandidatesSchema.safeParse(JSON.parse(result.content));
    if (!parsed.success) return { candidates: [], failed: true };
    const explicit = isExplicitRemember(userText);
    const candidates = parsed.data.candidates
      .map((c) => (explicit ? { ...c, confidence: Math.max(c.confidence, 1) } : c))
      // memory.md steps 2-3: drop secrets/PII and low-confidence candidates, plus anything that is not a fact about the user.
      .filter((c) => c.confidence >= 0.6 && !containsSecretOrPii(c.text) && isWorthKeeping(c.text));
    return { candidates, failed: false };
  } catch {
    return { candidates: [], failed: true };
  }
}

async function loadAuthedUser(db: Db, userId: string): Promise<AuthedUser | null> {
  const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!userRow || userRow.status !== 'active') return null;
  return {
    id: userRow.id,
    email: userRow.email,
    role: userRow.role,
    clearance: userRow.clearance as 0 | 1 | 2 | 3,
    status: userRow.status,
  };
}

/**
 * Stores each candidate. Everything the user says is kept as a private
 * user-scope memory (recallable by them in every space and chat); a fact the
 * model marks as team/project-wide is additionally stored project-scope so
 * members of that space see it, and nobody in other spaces does.
 */
export async function storeCandidates(
  deps: { db: Db; gateway: ModelGateway; user: AuthedUser; traceId: string },
  candidates: MemoryCandidate[],
  conversation: { id: string; projectId: string; workspaceId: string },
): Promise<SavedMemory[]> {
  const saved: SavedMemory[] = [];
  const userClassification = await computeSourceClassification(deps.db, conversation.id, conversation.projectId, { includeProjectDefault: false });
  let projectClassification: number | null = null;
  for (const candidate of candidates) {
    const base = {
      workspaceId: conversation.workspaceId,
      sourceConversationId: conversation.id,
      sourceTraceId: deps.traceId,
    };
    const own = await dedupeAndStore(
      deps,
      { ...candidate, scope: 'user' },
      { ...base, userId: deps.user.id, projectId: null, classification: userClassification },
    );
    if (own) saved.push(own);
    if (candidate.scope === 'project') {
      projectClassification ??= await computeSourceClassification(deps.db, conversation.id, conversation.projectId);
      await dedupeAndStore(
        deps,
        candidate,
        { ...base, userId: deps.user.id, projectId: conversation.projectId, classification: projectClassification },
      );
    }
  }
  return saved;
}

/**
 * The extraction scheduler's per-conversation entrypoint. Incremental: only
 * user messages newer than the last successful extraction are read. Returns
 * false when the model failed so the caller leaves the conversation queued.
 */
export async function runExtractionForConversation(
  deps: { db: Db; gateway: ModelGateway; spanWriter: SpanWriter },
  conversationId: string,
): Promise<boolean> {
  const [conversation] = await deps.db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (!conversation) return true;
  const user = await loadAuthedUser(deps.db, conversation.userId);
  if (!user) return true;

  const rows = await deps.db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  const since = conversation.memoryExtractedAt?.getTime() ?? 0;
  const newUserTurns = rows.filter((m) => m.role === 'user' && m.createdAt.getTime() > since).map((m) => m.content.trim()).filter(Boolean);
  if (newUserTurns.length === 0) {
    await deps.db.update(conversations).set({ memoryExtractedAt: new Date() }).where(eq(conversations.id, conversationId));
    return true;
  }

  const [trace] = await deps.db.insert(traces).values({ userId: user.id }).returning();
  if (!trace) return false;
  const started = Date.now();
  const { candidates, failed } = await extractCandidates({ gateway: deps.gateway, user, traceId: trace.id }, newUserTurns.join('\n'));

  let stored = 0;
  if (!failed) {
    stored = (await storeCandidates({ db: deps.db, gateway: deps.gateway, user, traceId: trace.id }, candidates, conversation)).length;
  }
  await deps.spanWriter.writeSpan({
    traceId: trace.id,
    kind: 'memory',
    name: 'memory.extract',
    latencyMs: Date.now() - started,
    status: failed ? 'error' : 'ok',
    attrs: { candidateCount: candidates.length, stored, conversationId },
  });

  await deps.db
    .update(traces)
    .set({ status: failed ? 'error' : 'ok', endedAt: new Date() })
    .where(eq(traces.id, trace.id));
  if (failed) {
    await deps.db
      .update(conversations)
      .set({ memoryExtractFailures: sql`${conversations.memoryExtractFailures} + 1` })
      .where(eq(conversations.id, conversationId));
    return false;
  }
  await deps.db.update(conversations).set({ memoryExtractedAt: new Date(), memoryExtractFailures: 0 }).where(eq(conversations.id, conversationId));
  return true;
}
