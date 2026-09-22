import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { documents } from './documents.js';
import { users } from './users.js';

export const accessRequestStatusEnum = pgEnum('access_request_status', [
  'pending',
  'approved',
  'denied',
]);

/**
 * The request half of security.md's "a user submits a request with a
 * reason; an admin approves it with an expiry" flow. Approval inserts a
 * row into access_grants (which retrieval already honors) and updates
 * this row's status/decidedBy/decidedAt in the same transaction.
 */
export const accessRequests = pgTable('access_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull(),
  status: accessRequestStatusEnum('status').notNull().default('pending'),
  decidedBy: uuid('decided_by').references(() => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
