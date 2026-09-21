import { inArray } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { documents } from '../db/schema/index.js';
import type { CitationMapEntry, RetrievedChunk } from './types.js';

/** Assigns stable [n] markers in insertion order and maps them to doc/page/bbox. */
export async function buildCitationMap(
  db: Db,
  chunks: RetrievedChunk[],
): Promise<CitationMapEntry[]> {
  if (chunks.length === 0) return [];

  const documentIds = [...new Set(chunks.map((c) => c.documentId))];
  const docRows = await db
    .select({ id: documents.id, filename: documents.filename })
    .from(documents)
    .where(inArray(documents.id, documentIds));
  const filenameById = new Map(docRows.map((d) => [d.id, d.filename]));

  return chunks.map((chunk, i) => ({
    marker: i + 1,
    documentId: chunk.documentId,
    filename: filenameById.get(chunk.documentId) ?? 'unknown',
    page: chunk.page,
    bbox: chunk.bbox,
  }));
}

/** Which citation markers the model's answer actually used, e.g. "...[1]...[3]". */
export function extractCitedMarkers(answerText: string): number[] {
  const markers = [...answerText.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  return [...new Set(markers)];
}
