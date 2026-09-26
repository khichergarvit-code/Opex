import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspacePathError, resolveInWorkspace } from './workspace.js';
import { createFolderTool, deleteFileTool, editFileTool, listFilesTool, moveFileTool, readFileTool, writeFileTool } from './fileTools.js';

vi.mock('./saveArtifacts.js', () => ({ saveArtifactRecords: vi.fn().mockResolvedValue([{ id: '22222222-2222-2222-2222-222222222222', filename: 'a.txt', mime: 'text/plain' }]) }));

const PROJECT = '11111111-1111-1111-1111-111111111111';
const USER = '33333333-3333-3333-3333-333333333333';
const SCOPE = { projectId: PROJECT, userId: USER };
let dir: string;
const ctx = () => ({ dataDir: dir, projectId: PROJECT, user: { id: USER }, traceId: 't', spanWriter: { writeSpan: vi.fn() } }) as never;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'opex-ws-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('resolveInWorkspace', () => {
  it.each(['../secret.txt', 'a/../../b.txt', '/etc/passwd', 'C:/x.txt', 'a//b.txt', './a.txt', 'bad name!.txt', ''])('rejects %j', async (p) => {
    await expect(resolveInWorkspace(dir, SCOPE, p)).rejects.toBeInstanceOf(WorkspacePathError);
  });
  it('rejects file types that are not allowed', async () => {
    await expect(resolveInWorkspace(dir, SCOPE, 'run.exe')).rejects.toThrow(/only these file types/);
  });
  it('accepts a normal name and stays inside the workspace', async () => {
    const r = await resolveInWorkspace(dir, SCOPE, 'notes/today.md');
    expect(r.abs.startsWith(r.root + path.sep)).toBe(true);
  });
  it('rejects a symlink that points outside the workspace', async () => {
    const outside = await mkdtemp(path.join(tmpdir(), 'opex-out-'));
    const root = path.join(dir, 'workspaces', PROJECT, USER);
    await mkdir(root, { recursive: true });
    await symlink(outside, path.join(root, 'link'));
    await expect(resolveInWorkspace(dir, SCOPE, 'link/x.txt')).rejects.toThrow(/symbolic links/);
    await rm(outside, { recursive: true, force: true });
  });
  it('gives each user a separate folder', async () => {
    const a = await resolveInWorkspace(dir, SCOPE, 'a.txt');
    const b = await resolveInWorkspace(dir, { projectId: PROJECT, userId: '44444444-4444-4444-4444-444444444444' }, 'a.txt');
    expect(a.abs).not.toBe(b.abs);
  });
  it('rejects an invalid project id', async () => {
    await expect(resolveInWorkspace(dir, { projectId: '../evil', userId: USER }, 'a.txt')).rejects.toBeInstanceOf(WorkspacePathError);
  });
});

describe('file tools', () => {
  it('creates, reads, edits, moves and deletes a file', async () => {
    const w = await writeFileTool.execute({ path: 'context-chat-memory.txt', content: 'hello world' }, ctx());
    expect(w.ok).toBe(true);
    expect(w.artifactIds).toHaveLength(1);
    expect(await readFile(path.join(dir, 'workspaces', PROJECT, USER, 'context-chat-memory.txt'), 'utf8')).toBe('hello world');

    expect((await readFileTool.execute({ path: 'context-chat-memory.txt' }, ctx())).summary).toContain('hello world');
    expect((await listFilesTool.execute({}, ctx())).summary).toContain('context-chat-memory.txt');

    expect((await editFileTool.execute({ path: 'context-chat-memory.txt', find: 'world', replace: 'OpeX' }, ctx())).ok).toBe(true);
    expect((await editFileTool.execute({ path: 'context-chat-memory.txt', find: 'nope', replace: 'x' }, ctx())).ok).toBe(false);

    expect((await moveFileTool.execute({ from: 'context-chat-memory.txt', to: 'renamed.txt' }, ctx())).ok).toBe(true);
    expect((await deleteFileTool.execute({ path: 'renamed.txt' }, ctx())).ok).toBe(true);
    expect((await readFileTool.execute({ path: 'renamed.txt' }, ctx())).ok).toBe(false);
  });
  it('refuses a traversal attempt and oversize content without touching disk', async () => {
    expect((await writeFileTool.execute({ path: '../../etc/x.txt', content: 'x' }, ctx())).ok).toBe(false);
    expect((await writeFileTool.execute({ path: 'big.txt', content: 'x'.repeat(1_100_000) }, ctx())).ok).toBe(false);
  });
  it('creates a folder and lists it', async () => {
    expect((await createFolderTool.execute({ path: 'reports/2026' }, ctx())).ok).toBe(true);
    expect((await listFilesTool.execute({}, ctx())).summary).toContain('reports/2026/ (folder)');
    expect((await createFolderTool.execute({ path: '../x' }, ctx())).ok).toBe(false);
  });
  it('says the workspace is empty when nothing was created', async () => {
    await writeFile(path.join(dir, 'unrelated.txt'), 'x');
    expect((await listFilesTool.execute({}, ctx())).summary).toBe('The workspace is empty.');
  });
});
