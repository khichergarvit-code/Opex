import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { callSandbox } from './sandboxClient.js';
import { saveArtifactRecords } from './saveArtifacts.js';
import type { ToolContext, ToolDefinition, ToolResult } from './types.js';
import { ALLOWED_EXTENSIONS, MAX_WRITE_BYTES, WorkspacePathError, resolveInWorkspace, scopeOf, workspaceRoot } from './workspace.js';

const MAX_INPUT_FILES = 40;
const MAX_INPUT_BYTES = 2_000_000;
const MAX_COMMAND_CHARS = 2000;

/** Commands that make no sense in a task and could only be a mistake or an attack. The container also makes them harmless. */
const DENY: Array<[RegExp, string]> = [
  [/\brm\s+(-[a-z]*\s+)*-[a-z]*[rf][a-z]*\s+(\/|~|\*|\.\.)/i, 'deleting the root, home or parent folders'],
  [/:\s*\(\s*\)\s*\{/, 'a fork bomb'],
  [/\bmkfs\b|\bdd\s+[^|;]*\bof=\/dev\//i, 'disk formatting or raw device writes'],
  [/>\s*\/dev\/(sd|nvme|disk)/i, 'raw device writes'],
  [/\b(shutdown|reboot|halt|poweroff)\b/i, 'shutting the machine down'],
  [/\.\.\//, 'paths outside the workspace'],
];

export function checkShellCommand(command: string): string | null {
  if (!command.trim()) return 'the command is empty';
  if (command.length > MAX_COMMAND_CHARS) return `the command is too long (limit ${MAX_COMMAND_CHARS} characters)`;
  for (const [re, why] of DENY) if (re.test(command)) return `it looks like ${why}`;
  return null;
}

async function collectWorkspaceFiles(root: string): Promise<Array<{ path: string; contentBase64: string }>> {
  const out: Array<{ path: string; contentBase64: string }> = [];
  let bytes = 0;
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(abs);
      else if (entry.isFile() && out.length < MAX_INPUT_FILES) {
        const st = await stat(abs);
        if (bytes + st.size > MAX_INPUT_BYTES) continue;
        bytes += st.size;
        out.push({ path: path.relative(root, abs), contentBase64: (await readFile(abs)).toString('base64') });
      }
    }
  };
  await walk(root);
  return out;
}

export const runShellTool: ToolDefinition = {
  name: 'run_shell',
  description:
    'Runs a bash command in an isolated sandbox (no network, 30 s limit, 512 MB) whose working folder holds copies of the project workspace files. ' +
    'Use it to count, search, convert or analyse files exactly (grep, wc, sort, awk, sed, python3). New files the command creates are saved to the workspace. Always asks the user first.',
  parameters: {
    type: 'object',
    properties: { command: { type: 'string', description: 'The bash command line to run in the working folder.' } },
    required: ['command'],
  },
  async execute(args, ctx: ToolContext): Promise<ToolResult> {
    const command = String(args.command ?? '');
    const refused = checkShellCommand(command);
    if (refused) return { ok: false, summary: `Not run: ${refused}.`, artifactIds: [] };
    const started = Date.now();
    try {
      const root = workspaceRoot(ctx.dataDir, scopeOf(ctx));
      await mkdir(root, { recursive: true });
      const inputs = await collectWorkspaceFiles(root);
      const result = await callSandbox(ctx.sandboxRunnerUrl, ctx.sandboxSharedSecret, {
        imageId: 'python-3.12-datasci',
        command: ['bash', '-c', command],
        files: inputs,
        timeoutS: 30,
        projectId: ctx.projectId,
      });

      // New files become workspace files and downloadable artifacts.
      const created: Array<{ path: string; contentBase64: string }> = [];
      for (const f of result.files.slice(0, 10)) {
        try {
          const size = Buffer.from(f.contentBase64, 'base64').byteLength;
          if (size > MAX_WRITE_BYTES || !ALLOWED_EXTENSIONS.has(path.extname(f.path).toLowerCase())) continue;
          const { abs } = await resolveInWorkspace(ctx.dataDir, scopeOf(ctx), f.path);
          await mkdir(path.dirname(abs), { recursive: true });
          await writeFile(abs, Buffer.from(f.contentBase64, 'base64'));
          created.push(f);
        } catch (err) {
          if (!(err instanceof WorkspacePathError)) throw err;
        }
      }
      const records = await saveArtifactRecords(ctx, 'file', created.map((f) => ({ path: path.basename(f.path), contentBase64: f.contentBase64 })));
      await ctx.spanWriter.writeSpan({
        traceId: ctx.traceId,
        kind: 'tool',
        name: 'tool.run_shell',
        latencyMs: Date.now() - started,
        status: result.exitCode === 0 ? 'ok' : 'error',
        attrs: { exitCode: result.exitCode, timedOut: result.timedOut, command: command.slice(0, 200), newFiles: created.map((f) => f.path) },
      });
      const out = [
        `<shell_result exit_code="${result.exitCode}" timed_out="${result.timedOut}">`,
        result.stdout ? `stdout:\n${result.stdout}${result.stdoutTruncated ? '\n[output truncated]' : ''}` : 'stdout: (empty)',
        result.stderr ? `stderr:\n${result.stderr}${result.stderrTruncated ? '\n[output truncated]' : ''}` : '',
        created.length > 0 ? `new files saved to the workspace: ${created.map((f) => f.path).join(', ')}` : '',
        '</shell_result>',
      ]
        .filter(Boolean)
        .join('\n');
      return { ok: result.exitCode === 0, summary: out, artifactIds: records.map((r) => r.id), artifacts: records };
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      return { ok: false, summary: /fetch failed|ECONNREFUSED|sandbox-runner/i.test(raw) ? 'The terminal sandbox is not running.' : `The command failed to run: ${raw.slice(0, 200)}`, artifactIds: [] };
    }
  },
};
