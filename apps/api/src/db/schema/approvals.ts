import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { conversations } from './conversations.js';
import { traces } from './traces.js';
import { users } from './users.js';

export const approvalStatusEnum = pgEnum('approval_status', ['pending', 'approved', 'denied']);

/**
 * B4: a paused tool call awaiting a human decision. Mirrors
 * accessRequests.ts's request/decide shape, plus executorCheckpoint —
 * the full paused-loop state (messages, iteration, agent, ids) needed to
 * resume runExecutor after a real process restart, since "survives a
 * restart" (tools.md's AC) means a Postgres row, never in-memory state.
 */
export const approvals = pgTable('approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  traceId: uuid('trace_id')
    .notNull()
    .references(() => traces.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  requesterId: uuid('requester_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  agentName: text('agent_name').notNull(),
  toolName: text('tool_name').notNull(),
  args: jsonb('args').notNull().default({}),
  reason: text('reason').notNull(),
  status: approvalStatusEnum('status').notNull().default('pending'),
  decidedBy: uuid('decided_by').references(() => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  executorCheckpoint: jsonb('executor_checkpoint').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
