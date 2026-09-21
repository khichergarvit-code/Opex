import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * Append-only: enforced by a DB trigger (see the audit_log_append_only migration),
 * not just application code, per invariant #7. prev_hash/hash stay NULL until the
 * hash chain is added in B1 — the trigger is what A1 actually enforces.
 */
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  resource: text('resource').notNull(),
  details: jsonb('details').notNull().default({}),
  prevHash: text('prev_hash'),
  hash: text('hash'),
});
