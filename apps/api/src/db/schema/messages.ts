import { jsonb, pgEnum, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { conversations } from './conversations.js';
import { traces } from './traces.js';

export const messageRoleEnum = pgEnum('message_role', ['user', 'assistant', 'system']);

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: messageRoleEnum('role').notNull(),
  content: text('content').notNull(),
  traceId: uuid('trace_id').references(() => traces.id, { onDelete: 'set null' }),
  classification: smallint('classification').notNull().default(0),
  // [{marker, documentId, filename, page, bbox}] — lets the viewer replay
  // citations on conversation reload, not just from the live SSE stream.
  citations: jsonb('citations').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
