import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { documents, messages, projects } from '../db/schema/index.js';

interface StoredCitation {
  documentId?: string;
}

/**
 * messages.classification is currently always 0 (no real per-task
 * classification tracker exists yet — invariant #10's gate defaults to
 * Public, documented Debt since B1). The one real signal available is
 * what a conversation actually touched: the project's own default
 * classification, and every document cited in its messages. This is a
 * deliberate approximation, not a full task-classification system.
 */
export async function computeSourceClassification(
  db: Db,
  conversationId: string,
  projectId: string,
  opts: { includeProjectDefault?: boolean } = {},
): Promise<number> {
  const [project] = await db.select({ defaultClassification: projects.defaultClassification }).from(projects).where(eq(projects.id, projectId)).limit(1);
  // A fact the user states about themselves is not derived from the project's default classification —
  // only from documents actually cited in the conversation — so it stays recallable in every space.
  let max = opts.includeProjectDefault === false ? 0 : (project?.defaultClassification ?? 0);

  const rows = await db
    .select({ citations: messages.citations })
    .from(messages)
    .where(eq(messages.conversationId, conversationId));

  const documentIds = new Set<string>();
  for (const row of rows) {
    const citations = (row.citations ?? []) as StoredCitation[];
    for (const c of citations) {
      if (c.documentId) documentIds.add(c.documentId);
    }
  }
  if (documentIds.size > 0) {
    const docRows = await db
      .select({ classification: documents.classification })
      .from(documents)
      .where(inArray(documents.id, [...documentIds]));
    for (const d of docRows) {
      if (d.classification > max) max = d.classification;
    }
  }
  return max;
}
