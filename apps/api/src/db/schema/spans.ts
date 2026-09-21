import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { traces } from './traces.js';

export const spanKindEnum = pgEnum('span_kind', ['llm', 'retrieval', 'memory', 'tool', 'policy']);
export const spanStatusEnum = pgEnum('span_status', ['ok', 'error']);

export const spans = pgTable('spans', {
  id: uuid('id').primaryKey().defaultRandom(),
  traceId: uuid('trace_id')
    .notNull()
    .references(() => traces.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id'),
  kind: spanKindEnum('kind').notNull(),
  name: text('name').notNull(),
  model: text('model'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  latencyMs: integer('latency_ms'),
  status: spanStatusEnum('status').notNull(),
  attrs: jsonb('attrs').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
