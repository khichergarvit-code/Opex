import { boolean, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { messages } from './messages.js';
import { traces } from './traces.js';
import { users } from './users.js';

export const feedbackRatingEnum = pgEnum('feedback_rating', ['thumbs_up', 'thumbs_down']);

/**
 * ui.md's Feedback triage: a thumbs-down opens its trace, an admin tags a
 * root cause, and can export the case to eval. traceId is denormalized
 * from messages.traceId purely to make the triage-queue query a single
 * join instead of two.
 */
export const feedback = pgTable('feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id')
    .notNull()
    .references(() => messages.id, { onDelete: 'cascade' }),
  traceId: uuid('trace_id').references(() => traces.id, { onDelete: 'set null' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  rating: feedbackRatingEnum('rating').notNull(),
  rootCauseTag: text('root_cause_tag'),
  exportedToEval: boolean('exported_to_eval').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
