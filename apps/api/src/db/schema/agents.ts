import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { modelRoleEnum } from './models.js';

/**
 * Agents are config, per orchestration.md. Seeded (not migrated) in
 * db/seed.ts: general/doc_qa in A2, vision/analysis added in A3.
 */
export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    version: integer('version').notNull().default(1),
    description: text('description').notNull(),
    systemPromptTemplate: text('system_prompt_template').notNull(),
    modelRole: modelRoleEnum('model_role').notNull(),
    toolAllowlist: text('tool_allowlist').array().notNull().default([]),
    memoryPolicy: jsonb('memory_policy').notNull().default({}),
    maxIterations: integer('max_iterations').notNull().default(8),
    requiresApprovalTools: text('requires_approval_tools').array().notNull().default([]),
    enabled: boolean('enabled').notNull().default(true),
    allowedGroups: uuid('allowed_groups').array().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('agents_name_version_idx').on(t.name, t.version)],
);
