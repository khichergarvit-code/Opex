import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';

export const INTERRUPTED_NOTICE = '⚠️ This request was interrupted before an answer was written (the server restarted). Please try again.';

/**
 * Run once at boot, before the server accepts requests: nothing that was in
 * flight survives a restart, so a chat whose last message is an unanswered user
 * turn would otherwise sit on "OpeX is still working…" forever. Closes the
 * dangling traces and gives each such chat a visible, retryable failure.
 */
export async function recoverInterruptedTurns(db: Db): Promise<number> {
  await db.execute(sql`
    UPDATE traces SET status = 'error', ended_at = now()
    WHERE status = 'running' AND conversation_id IS NOT NULL
  `);
  const inserted = (await db.execute(sql`
    INSERT INTO messages (conversation_id, role, content)
    SELECT c.id, 'assistant', ${INTERRUPTED_NOTICE}
    FROM conversations c
    WHERE NOT EXISTS (SELECT 1 FROM traces t WHERE t.conversation_id = c.id AND t.status = 'awaiting_approval')
      AND (SELECT m.role FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) = 'user'
    RETURNING conversation_id
  `)) as unknown as unknown[];
  return inserted.length;
}
