import { readFile } from 'node:fs/promises';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { documents } from '../db/schema/index.js';
import type { ModelGateway } from '../models/gateway.js';
import type { AuthedUser } from '../policy/types.js';
import { aclWhereClause, uuidArrayLiteral } from '../retrieval/aclFilter.js';
import type { RetrievedChunk } from '../retrieval/types.js';

const MAP_PROMPT_PATH = new URL('../prompts/summarize-map.md', import.meta.url);
const REDUCE_PROMPT_PATH = new URL('../prompts/summarize-reduce.md', import.meta.url);

export const BATCH_TOKENS = 2500;
export const MAX_INPUT_TOKENS = 12000;

const SUMMARIZE_INTENT = /\b(summari[sz]e|summari[sz]ation|summary|tl;?dr|recap|give me (an )?overview|key points)\b/i;

export function isSummarizeRequest(message: string): boolean {
  return SUMMARIZE_INTENT.test(message);
}

const estimateTokens = (text: string) => Math.ceil(text.length / 4);
const normalize = (s: string) => s.toLowerCase().replace(/\.[a-z0-9]{2,5}$/, '').replace(/[^a-z0-9]+/g, ' ').trim();

export interface VisibleDocument {
  id: string;
  filename: string;
  classification: number;
  pageCount: number | null;
}

export type SummaryTarget =
  | { kind: 'found'; document: VisibleDocument }
  | { kind: 'ambiguous'; names: string[] }
  | { kind: 'none' };

/** Picks the document a summarise request refers to, from the ones this user may see. Pure. */
export function pickTarget(message: string, visible: VisibleDocument[]): SummaryTarget {
  if (visible.length === 0) return { kind: 'none' };
  const haystack = ` ${normalize(message)} `;
  const named = visible
    .map((d) => ({ d, name: normalize(d.filename) }))
    .filter(({ name }) => name.length >= 3 && haystack.includes(` ${name} `));
  if (named.length > 0) {
    const longest = Math.max(...named.map((n) => n.name.length));
    const best = named.filter((n) => n.name.length === longest);
    if (best.length === 1) return { kind: 'found', document: best[0]!.d };
    return { kind: 'ambiguous', names: best.map((n) => n.d.filename) };
  }
  if (visible.length === 1) return { kind: 'found', document: visible[0]! };
  return { kind: 'ambiguous', names: visible.slice(0, 8).map((d) => d.filename) };
}

/** Ready documents in the project this user may read — the ACL is part of the SQL (invariant 4). */
export async function listVisibleDocuments(
  db: Db,
  p: { workspaceId: string; projectId: string; userId: string; clearance: number; groupIds: string[] },
): Promise<VisibleDocument[]> {
  const groups = uuidArrayLiteral(p.groupIds);
  const rows = await db
    .select({ id: documents.id, filename: documents.filename, classification: documents.classification, pageCount: documents.pageCount })
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, p.workspaceId),
        eq(documents.projectId, p.projectId),
        eq(documents.status, 'ready'),
        sql`(${documents.classification} <= ${p.clearance} OR EXISTS (
          SELECT 1 FROM access_grants g WHERE g.document_id = ${documents.id} AND g.user_id = ${p.userId}
            AND (g.expires_at IS NULL OR g.expires_at > now())))`,
        sql`(${documents.aclGroupIds} && ${groups}::uuid[] OR ${documents.aclGroupIds} = '{}')`,
      ),
    );
  return rows;
}

/** All chunks of one document, in reading order, through the same ACL fragment retrieval uses. */
export async function loadDocumentChunks(
  db: Db,
  p: { workspaceId: string; projectId: string; userId: string; clearance: number; groupIds: string[]; documentId: string },
): Promise<RetrievedChunk[]> {
  const where = aclWhereClause({
    workspaceId: p.workspaceId,
    projectIds: [p.projectId],
    userId: p.userId,
    clearance: p.clearance as never,
    groupIds: p.groupIds,
    query: '',
  });
  const rows = (await db.execute(sql`
    SELECT c.id, c.document_id, c.page, c.bbox, c.section_path, c.text, c.kind, c.suspicious
    FROM chunks c
    WHERE ${where} AND c.document_id = ${p.documentId}
    ORDER BY c.page, c.chunk_index
  `)) as unknown as Array<{
    id: string; document_id: string; page: number; bbox: RetrievedChunk['bbox']; section_path: string[];
    text: string; kind: RetrievedChunk['kind']; suspicious: boolean;
  }>;
  return rows.map((r) => ({
    id: r.id, documentId: r.document_id, page: r.page, bbox: r.bbox, sectionPath: r.section_path,
    text: r.text, kind: r.kind, suspicious: r.suspicious, score: 0,
  }));
}

/** Keeps an evenly spaced subset when the document is longer than the input budget. */
export function sampleChunks<T extends { text: string }>(chunks: T[], maxTokens = MAX_INPUT_TOKENS): T[] {
  const total = chunks.reduce((n, c) => n + estimateTokens(c.text), 0);
  if (total <= maxTokens) return chunks;
  const keep = Math.max(1, Math.floor(chunks.length * (maxTokens / total)));
  const picked: T[] = [];
  for (let i = 0; i < keep; i++) picked.push(chunks[Math.floor((i * chunks.length) / keep)]!);
  return picked;
}

export function planBatches<T extends { text: string }>(chunks: T[], batchTokens = BATCH_TOKENS): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let used = 0;
  for (const chunk of chunks) {
    const t = estimateTokens(chunk.text);
    if (current.length > 0 && used + t > batchTokens) {
      batches.push(current);
      current = [];
      used = 0;
    }
    current.push(chunk);
    used += t;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** Marker numbers are 1-based positions in `used`, matching the citation chips the UI renders. */
function renderSections(used: RetrievedChunk[], batch: RetrievedChunk[], filename: string): string {
  return batch
    .map((c) => {
      const marker = used.indexOf(c) + 1;
      return `<document_section index="${marker}" document="${filename}" page="${c.page}" suspicious="${c.suspicious}">\n${c.text}\n</document_section>`;
    })
    .join('\n\n');
}

export interface SummarizeDeps {
  gateway: ModelGateway;
  user: AuthedUser;
  traceId: string;
  signal?: AbortSignal;
  modelId?: string;
  onProgress: (label: string) => void;
  onToken: (delta: string) => void;
}

export interface SummarizeResult {
  text: string;
  used: RetrievedChunk[];
  totalChunks: number;
}

/** Map-reduce over the document's chunks via the gateway; the final pass streams. */
export async function summarizeChunks(deps: SummarizeDeps, filename: string, allChunks: RetrievedChunk[]): Promise<SummarizeResult> {
  const used = sampleChunks(allChunks);
  const batches = planBatches(used);
  const [mapPrompt, reducePrompt] = await Promise.all([readFile(MAP_PROMPT_PATH, 'utf8'), readFile(REDUCE_PROMPT_PATH, 'utf8')]);

  let reduceInput: string;
  if (batches.length <= 1) {
    reduceInput = renderSections(used, used, filename);
  } else {
    const notes: string[] = [];
    for (const [i, batch] of batches.entries()) {
      deps.onProgress(`Reading part ${i + 1} of ${batches.length}…`);
      const res = await deps.gateway.chat({
        role: 'general',
        modelId: deps.modelId,
        signal: deps.signal,
        messages: [
          { role: 'system', content: mapPrompt },
          { role: 'user', content: renderSections(used, batch, filename) },
        ],
        user: deps.user,
        traceId: deps.traceId,
        budget: { maxTokens: 500 },
      });
      notes.push(res.content.trim());
    }
    reduceInput = `<document_notes document="${filename}">\n${notes.join('\n')}\n</document_notes>`;
  }

  deps.onProgress('Writing the summary…');
  let text = '';
  for await (const delta of deps.gateway.chatStream({
    role: 'general',
    modelId: deps.modelId,
    signal: deps.signal,
    messages: [
      { role: 'system', content: reducePrompt },
      { role: 'user', content: `${reduceInput}\n\nSummarize the document "${filename}". Put the section index in square brackets, like [2], after every key point.` },
    ],
    user: deps.user,
    traceId: deps.traceId,
  })) {
    text += delta;
    deps.onToken(delta);
  }
  return { text, used, totalChunks: allChunks.length };
}
