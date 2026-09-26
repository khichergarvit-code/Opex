import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { artifacts } from '../../db/schema/index.js';
import type { SandboxFileOutput } from './sandboxClient.js';
import type { ToolContext } from './types.js';

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.log': 'text/plain',
  '.py': 'text/x-python',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.xml': 'application/xml',
  '.tsv': 'text/tab-separated-values',
};

function mimeFor(filename: string): string {
  return MIME_BY_EXTENSION[path.extname(filename).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Persists sandbox output files to data/artifacts/{workspaceId}/{traceId}/
 * and inserts `artifacts` rows. Classification inherits the task's current
 * classification floor (invariant #9) — the simplest sound choice while
 * there's only one classification source (the current task), not a
 * multi-document synthesis yet.
 */
export async function saveArtifacts(ctx: ToolContext, kind: string, files: SandboxFileOutput[]): Promise<string[]> {
  return (await saveArtifactRecords(ctx, kind, files)).map((r) => r.id);
}

export async function saveArtifactRecords(
  ctx: ToolContext,
  kind: string,
  files: SandboxFileOutput[],
): Promise<Array<{ id: string; filename: string; mime: string }>> {
  if (files.length === 0) return [];
  const destDir = path.resolve(ctx.dataDir, 'artifacts', ctx.workspaceId, ctx.traceId);
  await mkdir(destDir, { recursive: true });

  const records: Array<{ id: string; filename: string; mime: string }> = [];
  for (const file of files) {
    const buffer = Buffer.from(file.contentBase64, 'base64');
    const safeName = path.basename(file.path);
    await writeFile(path.join(destDir, safeName), buffer);

    const [row] = await ctx.db
      .insert(artifacts)
      .values({
        traceId: ctx.traceId,
        conversationId: ctx.conversationId,
        workspaceId: ctx.workspaceId,
        projectId: ctx.projectId,
        kind,
        filename: safeName,
        mime: mimeFor(safeName),
        sizeBytes: buffer.byteLength,
        storagePath: path.join('artifacts', ctx.workspaceId, ctx.traceId, safeName),
        classification: ctx.taskClassification,
        createdBy: ctx.user.id,
      })
      .returning({ id: artifacts.id });
    if (row) records.push({ id: row.id, filename: safeName, mime: mimeFor(safeName) });
  }
  return records;
}
