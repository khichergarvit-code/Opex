import { integer, pgEnum, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { workspaces } from './workspaces.js';

export const roleEnum = pgEnum('role', ['super_admin', 'workspace_admin', 'employee']);
export const userStatusEnum = pgEnum('user_status', ['active', 'disabled']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('employee'),
  // 0 Public, 1 Internal, 2 Confidential, 3 Restricted — see packages/shared classification.ts
  clearance: smallint('clearance').notNull().default(1),
  /** Which workspace the person belongs to. null = platform-wide (super admin). A workspace admin only administers this one. */
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
  status: userStatusEnum('status').notNull().default('active'),
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
