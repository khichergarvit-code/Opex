import { integer, pgEnum, pgTable, real, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { vector } from 'drizzle-orm/pg-core/columns/vector_extension/vector';
import { conversations } from './conversations.js';
import { projects } from './projects.js';
import { traces } from './traces.js';
import { users } from './users.js';
import { workspaces } from './workspaces.js';

export const memoryTypeEnum = pgEnum('memory_type', ['episodic', 'semantic']);
export const memoryScopeEnum = pgEnum('memory_scope', ['user', 'project', 'workspace']);
// "Memory derived from documents or the web is untrusted" (memory.md) —
// this drives whether an injected memory block gets the extra untrusted
// warning (see memory/longterm.ts), not whether it's classification-gated
// (classification/ACL apply to every row regardless of sourceKind).
export const memorySourceKindEnum = pgEnum('memory_source_kind', ['conversation', 'document', 'web']);

/**
 * B2's long-term memory store (docs/spec/memory.md). ACL-filtered the same
 * way chunks are (invariant #4/#9) — see retrieval/memoryAclFilter.ts;
 * never filter these in JS after a fetch.
 */
export const memories = pgTable('memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  // Null unless scope='project'.
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  // Whose memory this is (scope='user') or who it was extracted for/by otherwise.
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: memoryTypeEnum('type').notNull(),
  scope: memoryScopeEnum('scope').notNull(),
  text: text('text').notNull(),
  // Same bge-m3 dimension as chunks.embedding.
  embedding: vector('embedding', { dimensions: 1024 }),
  confidence: real('confidence').notNull(),
  classification: smallint('classification').notNull().default(0),
  sourceKind: memorySourceKindEnum('source_kind').notNull().default('conversation'),
  sourceConversationId: uuid('source_conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  sourceTraceId: uuid('source_trace_id').references(() => traces.id, { onDelete: 'set null' }),
  // Self-referencing version chain (memory.md step 4: "merge with or
  // supersede... keeping versions") — the superseded row is soft-deleted,
  // not removed, via deletedAt below.
  supersedesId: uuid('supersedes_id'),
  accessCount: integer('access_count').notNull().default(0),
  lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
