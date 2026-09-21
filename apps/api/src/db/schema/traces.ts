import { pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const traceStatusEnum = pgEnum('trace_status', ['running', 'ok', 'error']);

// conversations is defined after traces to avoid a circular import — messages.trace_id and
// traces.conversation_id reference each other's tables; see conversations.ts / messages.ts.
export const traces = pgTable('traces', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id'),
  status: traceStatusEnum('status').notNull().default('running'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
});
