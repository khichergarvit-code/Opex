import { boolean, integer, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const modelRoleEnum = pgEnum('model_role', [
  'router',
  'general',
  'coder',
  'vision',
  'embed',
  'rerank',
]);

/**
 * Loaded from infra/models/manifest.yaml at API boot, after each entry's SHA-256
 * is verified against the manifest (invariant #3). id is the manifest's model id.
 */
export const models = pgTable('models', {
  id: text('id').primaryKey(),
  role: modelRoleEnum('role').notNull(),
  endpoint: text('endpoint').notNull(),
  ggufPath: text('gguf_path').notNull(),
  mmprojPath: text('mmproj_path'),
  sha256: text('sha256').notNull(),
  ctxLen: integer('ctx_len').notNull(),
  capabilities: text('capabilities').array().notNull().default([]),
  vramMb: integer('vram_mb'),
  license: text('license').notNull(),
  origin: text('origin').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
