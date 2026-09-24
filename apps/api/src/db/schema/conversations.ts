import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';
import { users } from './users.js';
import { workspaces } from './workspaces.js';

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title'),
  // auto | on | off — whether this chat may use the project's documents.
  documentMode: text('document_mode').notNull().default('auto'),
  // Working memory's rolling summary (A3) — folded from older turns once
  // history exceeds the working-memory budget threshold.
  workingSummary: text('working_summary'),
  // B2: set once this conversation's long-term memory has been extracted,
  // so the scheduler doesn't re-extract from the same idle conversation
  // repeatedly (memory/scheduler.ts only extracts when null or stale).
  memoryExtractedAt: timestamp('memory_extracted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
