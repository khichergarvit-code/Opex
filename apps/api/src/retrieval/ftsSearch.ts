import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { aclWhereClause } from './aclFilter.js';
import type { RetrievedChunk, SearchParams } from './types.js';

interface FtsRow {
  id: string;
  document_id: string;
  page: number;
  bbox: RetrievedChunk['bbox'];
  section_path: string[];
  text: string;
  kind: RetrievedChunk['kind'];
  suspicious: boolean;
  score: number;
}

export async function ftsSearch(
  db: Db,
  params: SearchParams,
  topK: number,
): Promise<RetrievedChunk[]> {
  const where = aclWhereClause(params);

  // 'simple' config throughout — matches the tsv column's own config, so
  // Hindi text isn't broken by English stemming (documents.md).
  const rows = (await db.execute(sql`
    SELECT c.id, c.document_id, c.page, c.bbox, c.section_path, c.text, c.kind, c.suspicious,
           ts_rank(c.tsv, websearch_to_tsquery('simple', ${params.query})) AS score
    FROM chunks c
    WHERE ${where}
      AND c.tsv @@ websearch_to_tsquery('simple', ${params.query})
    ORDER BY score DESC
    LIMIT ${topK}
  `)) as unknown as FtsRow[];

  return rows.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    page: row.page,
    bbox: row.bbox,
    sectionPath: row.section_path,
    text: row.text,
    kind: row.kind,
    suspicious: row.suspicious,
    score: Number(row.score),
  }));
}
