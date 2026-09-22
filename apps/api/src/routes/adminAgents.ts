import { writeFile, readFile } from 'node:fs/promises';
import { and, desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { agents, traces } from '../db/schema/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { can } from '../policy/can.js';
import type { ModelGateway } from '../models/gateway.js';
import type { AuditWriter } from '../audit/writeAudit.js';

const PROMPTS_DIR = new URL('../prompts/', import.meta.url);

const createAgentVersionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  modelRole: z.enum(['router', 'general', 'coder', 'vision', 'embed', 'rerank']),
  systemPromptContent: z.string().min(1),
  toolAllowlist: z.array(z.string()).default([]),
  maxIterations: z.number().int().min(1).max(20).default(8),
});

const testChatSchema = z.object({
  agentId: z.string().uuid(),
  message: z.string().min(1),
});

/** ui.md's Admin §B5: "Agents: a prompt editor with versions, diffs, and a test chat." */
export function createAdminAgentsRouter(db: Db, gateway: ModelGateway, auditWriter: AuditWriter): Router {
  const router = Router();

  router.get('/admin/agents', requireAuth(db), async (req, res) => {
    const decision = can(req.user!, 'admin:agents:manage');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const rows = await db.select().from(agents).orderBy(agents.name, desc(agents.version));
    res.json(rows);
  });

  router.get('/admin/agents/:name/versions/:version/prompt', requireAuth(db), async (req, res) => {
    const decision = can(req.user!, 'admin:agents:manage');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const [row] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.name, req.params.name as string), eq(agents.version, Number(req.params.version))))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: 'agent version not found' });
      return;
    }
    const content = await readFile(new URL(row.systemPromptTemplate, PROMPTS_DIR), 'utf8');
    res.json({ content });
  });

  router.post('/admin/agents', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const decision = can(user, 'admin:agents:manage');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const parsed = createAgentVersionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }
    const [latest] = await db
      .select()
      .from(agents)
      .where(eq(agents.name, parsed.data.name))
      .orderBy(desc(agents.version))
      .limit(1);
    const version = (latest?.version ?? 0) + 1;
    const filename = `${parsed.data.name}.v${version}.md`;
    await writeFile(new URL(filename, PROMPTS_DIR), parsed.data.systemPromptContent, 'utf8');
    const [row] = await db
      .insert(agents)
      .values({
        name: parsed.data.name,
        version,
        description: parsed.data.description,
        systemPromptTemplate: filename,
        modelRole: parsed.data.modelRole,
        toolAllowlist: parsed.data.toolAllowlist,
        maxIterations: parsed.data.maxIterations,
      })
      .returning();
    await auditWriter.writeAudit({
      actorId: user.id,
      action: 'agent.version.create',
      resource: `${parsed.data.name}:${version}`,
    });
    res.status(201).json(row);
  });

  router.post('/admin/agents/test-chat', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const decision = can(user, 'admin:agents:manage');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const parsed = testChatSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }
    const [agent] = await db.select().from(agents).where(eq(agents.id, parsed.data.agentId)).limit(1);
    if (!agent) {
      res.status(404).json({ error: 'agent not found' });
      return;
    }
    const systemPrompt = await readFile(new URL(agent.systemPromptTemplate, PROMPTS_DIR), 'utf8');
    // A throwaway completion — no conversations/messages row is written,
    // but gateway.chat() still writes a span itself (invariant #6 applies
    // regardless of persistence). It isn't tagged as an admin test in the
    // span's attrs — gateway.ChatRequest has no attrs passthrough today —
    // so it's visible in /admin/logs like any other llm-kind span.
    const [trace] = await db.insert(traces).values({ userId: user.id }).returning();
    if (!trace) throw new Error('failed to open trace');
    const result = await gateway.chat({
      role: agent.modelRole,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: parsed.data.message },
      ],
      user,
      traceId: trace.id,
    });
    res.json({ content: result.content, tokensIn: result.tokensIn, tokensOut: result.tokensOut });
  });

  return router;
}
