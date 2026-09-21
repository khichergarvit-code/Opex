import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * A1 only reads `rules.allowedModelsByRole`. The other fields security.md
 * describes (quota, tools, upload limits, web access, approvals) exist in the
 * jsonb shape for forward compatibility but are no-ops until later milestones.
 */
export const policies = pgTable('policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  rules: jsonb('rules').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
