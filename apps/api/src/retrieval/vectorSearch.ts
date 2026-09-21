import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { aclWhereClause } from './aclFilter.js';
import type { RetrievedChunk, SearchParams } from './types.js';

function toPgVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

interface VectorRow {
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

export async function vectorSearch(
  db: Db,
  params: SearchParams,
  queryEmbedding: number[],
  topK: number,
): Promise<RetrievedChunk[]> {
  const vectorLiteral = toPgVectorLiteral(queryEmbedding);
  const where = aclWhereClause(params);

  // hnsw.iterative_scan is session/transaction-scoped (SET LOCAL requires a
  // transaction) — see A1's Spike D, which confirmed this pgvector build
  // supports it and that filtered HNSW still returns k rows without it at
  // this corpus's selectivity, but we set it anyway as the documented fallback.
  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL hnsw.iterative_scan = relaxed_order`);
    const result = await tx.execute(sql`
      SELECT c.id, c.document_id, c.page, c.bbox, c.section_path, c.text, c.kind, c.suspicious,
             1 - (c.embedding <=> ${vectorLiteral}::vector) AS score
      FROM chunks c
      WHERE ${where}
        AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> ${vectorLiteral}::vector
      LIMIT ${topK}
    `);
    return result as unknown as VectorRow[];
  });

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
