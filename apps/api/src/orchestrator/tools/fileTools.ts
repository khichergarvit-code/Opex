import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { memoryAclWhereClause } from '../../retrieval/memoryAclFilter.js';
import { saveArtifactRecords } from './saveArtifacts.js';
import type { ToolContext, ToolDefinition, ToolResult } from './types.js';
import { MAX_READ_BYTES, MAX_WRITE_BYTES, WorkspacePathError, resolveInWorkspace, scopeOf, workspaceRoot } from './workspace.js';

async function audit(ctx: ToolContext, action: string, details: Record<string, unknown>): Promise<void> {
  await ctx.spanWriter.writeSpan({
    traceId: ctx.traceId,
    kind: 'tool',
    name: `tool.${action}`,
    latencyMs: 0,
    status: 'ok',
    attrs: details,
  });
}

function fail(err: unknown): ToolResult {
  const message = err instanceof WorkspacePathError ? err.message : err instanceof Error ? err.message : String(err);
  return { ok: false, summary: `Could not do that: ${message}`.slice(0, 300), artifactIds: [] };
}

async function listRecursive(dir: string, base: string, out: Array<{ path: string; size: number }>): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (out.length >= 200) return;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push({ path: `${path.relative(base, abs)}/`, size: 0 });
      await listRecursive(abs, base, out);
    } else if (entry.isFile()) out.push({ path: path.relative(base, abs), size: (await stat(abs)).size });
  }
}

export const listFilesTool: ToolDefinition = {
  name: 'list_files',
  description: "Lists the files in this project's workspace (name and size).",
  parameters: { type: 'object', properties: {} },
  async execute(_args, ctx): Promise<ToolResult> {
    const root = workspaceRoot(ctx.dataDir, scopeOf(ctx));
    const files: Array<{ path: string; size: number }> = [];
    await listRecursive(root, root, files).catch(() => {});
    if (files.length === 0) return { ok: true, summary: 'The workspace is empty.', artifactIds: [] };
    return { ok: true, summary: files.map((f) => (f.path.endsWith('/') ? `${f.path} (folder)` : `${f.path} (${f.size} bytes)`)).join('\n'), artifactIds: [] };
  },
};

export const readFileTool: ToolDefinition = {
  name: 'read_file',
  description: 'Reads a text file from the project workspace.',
  parameters: { type: 'object', properties: { path: { type: 'string', description: 'File name, e.g. notes.txt' } }, required: ['path'] },
  async execute(args, ctx): Promise<ToolResult> {
    try {
      const { abs, rel } = await resolveInWorkspace(ctx.dataDir, scopeOf(ctx), String(args.path ?? ''));
      const st = await stat(abs);
      if (st.size > MAX_READ_BYTES) return { ok: false, summary: `${rel} is too large to read (${st.size} bytes; limit ${MAX_READ_BYTES}).`, artifactIds: [] };
      const text = await readFile(abs, 'utf8');
      return { ok: true, summary: `<workspace_file name="${rel}">\n${text}\n</workspace_file>`, artifactIds: [] };
    } catch (err) {
      return fail(err);
    }
  },
};

export const writeFileTool: ToolDefinition = {
  name: 'write_file',
  description: 'Creates (or overwrites) a text file in the project workspace and gives the user a download link. Always asks the user first.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File name with an extension, e.g. context-chat-memory.txt' },
      content: { type: 'string', description: 'The full text content of the file.' },
    },
    required: ['path', 'content'],
  },
  async execute(args, ctx): Promise<ToolResult> {
    try {
      const content = String(args.content ?? '');
      if (Buffer.byteLength(content) > MAX_WRITE_BYTES) return { ok: false, summary: `The content is too large (limit ${MAX_WRITE_BYTES} bytes).`, artifactIds: [] };
      const { abs, rel } = await resolveInWorkspace(ctx.dataDir, scopeOf(ctx), String(args.path ?? ''));
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, content, 'utf8');
      const records = await saveArtifactRecords(ctx, 'file', [{ path: path.basename(rel), contentBase64: Buffer.from(content).toString('base64') }]);
      await audit(ctx, 'write_file', { path: rel, bytes: Buffer.byteLength(content) });
      return { ok: true, summary: `Created ${rel} (${Buffer.byteLength(content)} bytes). The user can download it from the chat.`, artifactIds: records.map((r) => r.id), artifacts: records };
    } catch (err) {
      return fail(err);
    }
  },
};

export const editFileTool: ToolDefinition = {
  name: 'edit_file',
  description: 'Replaces text in an existing workspace file. Always asks the user first.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      find: { type: 'string', description: 'Exact text to replace (must occur once).' },
      replace: { type: 'string', description: 'The new text.' },
    },
    required: ['path', 'find', 'replace'],
  },
  async execute(args, ctx): Promise<ToolResult> {
    try {
      const { abs, rel } = await resolveInWorkspace(ctx.dataDir, scopeOf(ctx), String(args.path ?? ''));
      const before = await readFile(abs, 'utf8');
      const find = String(args.find ?? '');
      const count = find ? before.split(find).length - 1 : 0;
      if (count !== 1) return { ok: false, summary: count === 0 ? 'The text to replace was not found.' : `The text occurs ${count} times; give a more specific piece.`, artifactIds: [] };
      const after = before.replace(find, () => String(args.replace ?? ''));
      if (Buffer.byteLength(after) > MAX_WRITE_BYTES) return { ok: false, summary: 'The edited file would be too large.', artifactIds: [] };
      await writeFile(abs, after, 'utf8');
      const records = await saveArtifactRecords(ctx, 'file', [{ path: path.basename(rel), contentBase64: Buffer.from(after).toString('base64') }]);
      await audit(ctx, 'edit_file', { path: rel });
      return { ok: true, summary: `Edited ${rel}.`, artifactIds: records.map((r) => r.id), artifacts: records };
    } catch (err) {
      return fail(err);
    }
  },
};

export const deleteFileTool: ToolDefinition = {
  name: 'delete_file',
  description: 'Deletes a file from the project workspace. Always asks the user first.',
  parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  async execute(args, ctx): Promise<ToolResult> {
    try {
      const { abs, rel } = await resolveInWorkspace(ctx.dataDir, scopeOf(ctx), String(args.path ?? ''));
      await stat(abs);
      await rm(abs);
      await audit(ctx, 'delete_file', { path: rel });
      return { ok: true, summary: `Deleted ${rel}.`, artifactIds: [] };
    } catch (err) {
      return fail(err);
    }
  },
};

export const moveFileTool: ToolDefinition = {
  name: 'move_file',
  description: 'Renames or moves a file inside the project workspace. Always asks the user first.',
  parameters: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] },
  async execute(args, ctx): Promise<ToolResult> {
    try {
      const a = await resolveInWorkspace(ctx.dataDir, scopeOf(ctx), String(args.from ?? ''));
      const b = await resolveInWorkspace(ctx.dataDir, scopeOf(ctx), String(args.to ?? ''));
      await stat(a.abs);
      await mkdir(path.dirname(b.abs), { recursive: true });
      await rename(a.abs, b.abs);
      await audit(ctx, 'move_file', { from: a.rel, to: b.rel });
      return { ok: true, summary: `Moved ${a.rel} to ${b.rel}.`, artifactIds: [] };
    } catch (err) {
      return fail(err);
    }
  },
};

export const createFolderTool: ToolDefinition = {
  name: 'create_folder',
  description: 'Creates a folder (and any missing parent folders) in the project workspace. Always asks the user first.',
  parameters: { type: 'object', properties: { path: { type: 'string', description: 'Folder name, e.g. reports or reports/2026' } }, required: ['path'] },
  async execute(args, ctx): Promise<ToolResult> {
    try {
      const { abs, rel } = await resolveInWorkspace(ctx.dataDir, scopeOf(ctx), String(args.path ?? ''), { requireExtension: false });
      await mkdir(abs, { recursive: true });
      await audit(ctx, 'create_folder', { path: rel });
      return { ok: true, summary: `Created the folder ${rel}/ in the workspace.`, artifactIds: [] };
    } catch (err) {
      return fail(err);
    }
  },
};

/** Lets "put everything you remember about me in a file" use real data, through the same ACL SQL as recall. */
export const readMemoriesTool: ToolDefinition = {
  name: 'read_memories',
  description: "Returns the facts OpeX has remembered about the user (their own saved memories), newest first.",
  parameters: { type: 'object', properties: {} },
  async execute(_args, ctx): Promise<ToolResult> {
    const where = memoryAclWhereClause({ userId: ctx.user.id, workspaceId: ctx.workspaceId, projectId: ctx.projectId, clearance: ctx.user.clearance });
    const rows = (await ctx.db.execute(sql`
      SELECT m.type, m.scope, m.text, m.created_at
      FROM memories m
      WHERE ${where}
      ORDER BY m.created_at DESC
      LIMIT 200
    `)) as unknown as Array<{ type: string; scope: string; text: string; created_at: string }>;
    if (rows.length === 0) return { ok: true, summary: 'No memories are saved yet.', artifactIds: [] };
    const body = rows.map((r) => `- [${r.type}/${r.scope}] ${r.text}`).join('\n');
    return { ok: true, summary: `<memories count="${rows.length}">\n${body}\n</memories>`, artifactIds: [] };
  },
};
