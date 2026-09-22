import { pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

// B4: 'awaiting_approval' marks a trace paused on a tool call pending a
// human decision (see schema/approvals.ts) — the trace resumes to 'ok'
// or 'error' once decided, same finalization path as a normal call.
export const traceStatusEnum = pgEnum('trace_status', ['running', 'ok', 'error', 'awaiting_approval']);

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
