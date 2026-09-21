import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { Router, type Response } from 'express';
import type { CitationEvent, SseEvent } from '@opex/shared';
import { createConversationRequestSchema, postMessageRequestSchema } from '@opex/shared';
import type { Db } from '../db/client.js';
import { conversations, messages, projectMembers, projects, traces } from '../db/schema/index.js';
import type { ModelGateway, SpanWriter } from '../models/gateway.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { can } from '../policy/can.js';
import { buildDocQaPrompt, extractCitedMarkers, projectHasReadyDocuments } from './docQa.js';

const CHAT_SYSTEM_PROMPT_PATH = fileURLToPath(new URL('../prompts/chat-system.md', import.meta.url));

function sendEvent(res: Response, event: SseEvent): void {
  res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
}

async function isProjectMember(db: Db, userId: string, projectId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.userId, userId), eq(projectMembers.projectId, projectId)))
    .limit(1);
  return rows.length > 0;
}

export function createConversationsRouter(db: Db, gateway: ModelGateway, spanWriter: SpanWriter): Router {
  const router = Router();

  router.post('/conversations', requireAuth(db), async (req, res) => {
    const parsed = createConversationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }
    const user = req.user!;
    const member = await isProjectMember(db, user.id, parsed.data.projectId);
    const decision = can(user, 'conversation:create', {
      projectId: parsed.data.projectId,
      isProjectMember: member,
    });
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, parsed.data.projectId))
      .limit(1);
    if (!project) {
      res.status(404).json({ error: 'project not found' });
      return;
    }

    const [row] = await db
      .insert(conversations)
      .values({
        workspaceId: project.workspaceId,
        projectId: parsed.data.projectId,
        userId: user.id,
        title: parsed.data.title,
      })
      .returning();
    res.status(201).json(row);
  });

  router.get('/conversations/:id', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, req.params.id as string))
      .limit(1);
    const conversation = rows[0];
    if (!conversation) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    const member = await isProjectMember(db, user.id, conversation.projectId);
    const decision = can(user, 'conversation:read', {
      projectId: conversation.projectId,
      isProjectMember: member,
    });
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation.id));
    res.json({ conversation, messages: history });
  });

  router.post('/conversations/:id/messages', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const parsed = postMessageRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }

    const rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, req.params.id as string))
      .limit(1);
    const conversation = rows[0];
    if (!conversation) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    const member = await isProjectMember(db, user.id, conversation.projectId);
    const decision = can(user, 'conversation:message', {
      projectId: conversation.projectId,
      isProjectMember: member,
    });
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }

    const [trace] = await db.insert(traces).values({ userId: user.id, conversationId: conversation.id }).returning();
    if (!trace) throw new Error('failed to open trace');

    await db.insert(messages).values({
      conversationId: conversation.id,
      role: 'user',
      content: parsed.data.content,
      traceId: trace.id,
    });

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });

    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation.id));
    // The just-inserted user row is last; prior turns exclude it since
    // doc_qa rebuilds the latest turn itself with retrieved chunks attached.
    const priorTurns = history.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));

    const useDocQa = await projectHasReadyDocuments(db, conversation.projectId);

    let assistantContent = '';
    let traceStatus: 'ok' | 'error' = 'ok';
    let citations: Array<{ marker: number; documentId: string; filename: string; page: number; bbox: unknown }> = [];

    if (useDocQa) {
      const docQa = await buildDocQaPrompt({
        db,
        gateway,
        spanWriter,
        user,
        traceId: trace.id,
        workspaceId: conversation.workspaceId,
        projectId: conversation.projectId,
        priorTurns,
        question: parsed.data.content,
      });

      if (docQa.noSupportAnswer) {
        assistantContent = docQa.noSupportAnswer;
        sendEvent(res, { type: 'token', data: { delta: assistantContent } });
      } else {
        try {
          for await (const delta of gateway.chatStream({
            role: 'general',
            messages: [
              { role: 'system', content: docQa.systemPrompt },
              ...docQa.messages,
            ],
            user,
            traceId: trace.id,
          })) {
            assistantContent += delta;
            sendEvent(res, { type: 'token', data: { delta } });
          }
          const citedMarkers = new Set(extractCitedMarkers(assistantContent));
          citations = docQa.citationMap.filter((c) => citedMarkers.has(c.marker));
          for (const citation of citations) {
            sendEvent(res, { type: 'citation', data: citation as CitationEvent['data'] });
          }
        } catch (err) {
          traceStatus = 'error';
          sendEvent(res, {
            type: 'error',
            data: { message: err instanceof Error ? err.message : 'model call failed' },
          });
        }
      }
    } else {
      const systemPrompt = await readFile(CHAT_SYSTEM_PROMPT_PATH, 'utf8');
      try {
        for await (const delta of gateway.chatStream({
          role: 'general',
          messages: [{ role: 'system', content: systemPrompt }, ...priorTurns, { role: 'user', content: parsed.data.content }],
          user,
          traceId: trace.id,
        })) {
          assistantContent += delta;
          sendEvent(res, { type: 'token', data: { delta } });
        }
      } catch (err) {
        traceStatus = 'error';
        sendEvent(res, {
          type: 'error',
          data: { message: err instanceof Error ? err.message : 'model call failed' },
        });
      }
    }

    let assistantMessageId = '';
    if (traceStatus === 'ok') {
      const [assistantRow] = await db
        .insert(messages)
        .values({
          conversationId: conversation.id,
          role: 'assistant',
          content: assistantContent,
          traceId: trace.id,
          citations,
        })
        .returning();
      assistantMessageId = assistantRow?.id ?? '';
    }

    await db
      .update(traces)
      .set({ status: traceStatus, endedAt: new Date() })
      .where(eq(traces.id, trace.id));

    if (traceStatus === 'ok') {
      sendEvent(res, { type: 'done', data: { messageId: assistantMessageId, traceId: trace.id } });
    }
    res.end();
  });

  return router;
}
