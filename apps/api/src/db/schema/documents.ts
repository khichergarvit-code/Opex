import {
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { projects } from './projects.js';
import { users } from './users.js';
import { workspaces } from './workspaces.js';

export const documentStatusEnum = pgEnum('document_status', [
  'queued',
  'processing',
  'ready',
  'failed',
]);

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    sha256: text('sha256').notNull(),
    filename: text('filename').notNull(),
    mime: text('mime').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    classification: smallint('classification').notNull(),
    aclGroupIds: uuid('acl_group_ids').array().notNull().default([]),
    status: documentStatusEnum('status').notNull().default('queued'),
    pageCount: integer('page_count'),
    pagesDone: integer('pages_done').notNull().default(0),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('documents_project_sha256_idx').on(t.projectId, t.sha256)],
);
