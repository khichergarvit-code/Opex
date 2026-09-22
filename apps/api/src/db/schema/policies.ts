import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces.js';

/**
 * B1 wires this table into can() for real via policy/loadPolicyRules.ts —
 * previously nothing ever queried it back. workspaceId null = the global
 * default policy (seeded as name:'default'); a non-null row overrides it
 * for that workspace.
 */
export const policies = pgTable(
  'policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    rules: jsonb('rules').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('policies_workspace_name_idx').on(t.workspaceId, t.name)],
);
