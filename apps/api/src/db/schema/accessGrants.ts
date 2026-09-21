import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { documents } from './documents.js';
import { users } from './users.js';

/**
 * Referenced by retrieval's ACL SQL from day one (invariant #4's exact
 * wording), but nothing writes to this table until B1's request/approve
 * flow exists — it stays empty through A2/A3 by design.
 */
export const accessGrants = pgTable('access_grants', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  grantedBy: uuid('granted_by')
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
