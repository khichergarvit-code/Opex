import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { feedback, messages } from '../db/schema/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { can } from '../policy/can.js';
import type { AuditWriter } from '../audit/writeAudit.js';

const submitFeedbackSchema = z.object({
  messageId: z.string().uuid(),
  rating: z.enum(['thumbs_up', 'thumbs_down']),
});

const tagFeedbackSchema = z.object({
  rootCauseTag: z.string().min(1).max(200),
});

const exportSchema = z.object({
  expectedKeyword: z.string().min(1).max(200),
});

const ANSWERS_JSON_PATH = path.join(process.cwd(), '..', '..', 'eval', 'questions', 'answers.json');

/** ui.md's Admin §B5 "Feedback triage": capture here, triage under /admin/feedback. */
export function createFeedbackRouter(db: Db, auditWriter: AuditWriter): Router {
  const router = Router();

  router.post('/feedback', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const parsed = submitFeedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }
    const [message] = await db.select().from(messages).where(eq(messages.id, parsed.data.messageId)).limit(1);
    if (!message) {
      res.status(404).json({ error: 'message not found' });
      return;
    }
    const [row] = await db
      .insert(feedback)
      .values({
        messageId: parsed.data.messageId,
        traceId: message.traceId,
        userId: user.id,
        rating: parsed.data.rating,
      })
      .returning();
    res.status(201).json(row);
  });

  router.get('/admin/feedback', requireAuth(db), async (req, res) => {
    const decision = can(req.user!, 'admin:feedback:triage');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const rating = typeof req.query.rating === 'string' ? req.query.rating : undefined;
    const rows = await db
      .select()
      .from(feedback)
      .where(rating ? eq(feedback.rating, rating as 'thumbs_up' | 'thumbs_down') : undefined)
      .orderBy(desc(feedback.createdAt));
    res.json(rows);
  });

  router.patch('/admin/feedback/:id', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const decision = can(user, 'admin:feedback:triage');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const parsed = tagFeedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }
    const [row] = await db
      .update(feedback)
      .set({ rootCauseTag: parsed.data.rootCauseTag })
      .where(eq(feedback.id, req.params.id as string))
      .returning();
    if (!row) {
      res.status(404).json({ error: 'feedback not found' });
      return;
    }
    await auditWriter.writeAudit({
      actorId: user.id,
      action: 'feedback.tag',
      resource: row.id,
      details: { rootCauseTag: parsed.data.rootCauseTag },
    });
    res.json(row);
  });

  router.post('/admin/feedback/:id/export-to-eval', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const decision = can(user, 'admin:feedback:triage');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const parsed = exportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }
    const [row] = await db.select().from(feedback).where(eq(feedback.id, req.params.id as string)).limit(1);
    if (!row) {
      res.status(404).json({ error: 'feedback not found' });
      return;
    }
    const [message] = await db.select().from(messages).where(eq(messages.id, row.messageId)).limit(1);
    if (!message) {
      res.status(404).json({ error: 'source message not found' });
      return;
    }
    // The question is the user turn immediately preceding the flagged
    // assistant answer, not the flagged message itself.
    let question = message.content;
    if (message.role === 'assistant') {
      const conversationMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, message.conversationId))
        .orderBy(messages.createdAt);
      const idx = conversationMessages.findIndex((m) => m.id === message.id);
      const precedingUserTurn = conversationMessages
        .slice(0, idx)
        .reverse()
        .find((m) => m.role === 'user');
      question = precedingUserTurn?.content ?? message.content;
    }

    const raw = await readFile(ANSWERS_JSON_PATH, 'utf8');
    const current = JSON.parse(raw) as Array<{ question: string; expectedKeyword: string }>;
    current.push({ question, expectedKeyword: parsed.data.expectedKeyword });
    await writeFile(ANSWERS_JSON_PATH, JSON.stringify(current, null, 2) + '\n', 'utf8');

    await db.update(feedback).set({ exportedToEval: true }).where(eq(feedback.id, row.id));
    await auditWriter.writeAudit({
      actorId: user.id,
      action: 'feedback.export',
      resource: row.id,
      details: { question, expectedKeyword: parsed.data.expectedKeyword },
    });
    res.status(204).end();
  });

  return router;
}
