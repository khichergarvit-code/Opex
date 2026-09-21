import { boolean, integer, jsonb, pgEnum, pgTable, smallint, text, uuid } from 'drizzle-orm/pg-core';
import { vector } from 'drizzle-orm/pg-core/columns/vector_extension/vector';
import { documents } from './documents.js';
import { projects } from './projects.js';
import { workspaces } from './workspaces.js';

export const chunkKindEnum = pgEnum('chunk_kind', ['text', 'table', 'figure_caption']);

/**
 * `tsv` is intentionally not declared here — it's a generated column
 * (`GENERATED ALWAYS AS (to_tsvector('simple', text)) STORED`) added by a
 * custom migration, and read/written only via raw SQL in retrieval.ts.
 * Drizzle's query builder never needs to construct it.
 */
export const chunks = pgTable('chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  classification: smallint('classification').notNull(),
  aclGroupIds: uuid('acl_group_ids').array().notNull().default([]),
  kind: chunkKindEnum('kind').notNull(),
  page: integer('page').notNull(),
  // {x0,y0,x1,y1, crop_path?} in PDF points; crop_path set for figure_caption chunks
  bbox: jsonb('bbox').notNull(),
  sectionPath: text('section_path').array().notNull().default([]),
  text: text('text').notNull(),
  // bge-m3's real output dimension — confirmed via a live /v1/embeddings call.
  embedding: vector('embedding', { dimensions: 1024 }),
  suspicious: boolean('suspicious').notNull().default(false),
  chunkIndex: integer('chunk_index').notNull(),
});
