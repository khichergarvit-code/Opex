import { callSandbox } from './sandboxClient.js';
import { saveArtifacts } from './saveArtifacts.js';
import type { ToolContext, ToolDefinition, ToolResult } from './types.js';

export const codeExecTool: ToolDefinition = {
  name: 'code_exec',
  description:
    'Runs a short Python snippet in an isolated, network-disabled sandbox and returns stdout/stderr. ' +
    'Set persist=true to also mount this project\'s durable data volume at /persist inside the sandbox — ' +
    'this always requires human approval before it runs.',
  parameters: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'Python source to execute.' },
      persist: {
        type: 'boolean',
        description: 'Mount the project\'s persisted data volume at /persist (read-write). Requires approval.',
      },
    },
    required: ['code'],
  },
  async execute(args, ctx: ToolContext): Promise<ToolResult> {
    const code = String(args.code ?? '');
    const persist = args.persist === true;
    const started = Date.now();
    try {
      const result = await callSandbox(ctx.sandboxRunnerUrl, ctx.sandboxSharedSecret, {
        imageId: 'python-3.12-datasci',
        code,
        timeoutS: 15,
        persist,
        projectId: ctx.projectId,
      });
      const artifactIds = await saveArtifacts(ctx, 'file', result.files);
      await ctx.spanWriter.writeSpan({
        traceId: ctx.traceId,
        kind: 'tool',
        name: 'tool.code_exec',
        latencyMs: Date.now() - started,
        status: result.exitCode === 0 ? 'ok' : 'error',
        attrs: { exitCode: result.exitCode, timedOut: result.timedOut },
      });
      const summary =
        result.exitCode === 0
          ? `Exit 0. stdout: ${result.stdout.slice(0, 500)}`
          : `Exit ${result.exitCode}. stderr: ${result.stderr.slice(0, 500)}`;
      return { ok: result.exitCode === 0, summary, artifactIds };
    } catch (err) {
      await ctx.spanWriter.writeSpan({
        traceId: ctx.traceId,
        kind: 'tool',
        name: 'tool.code_exec',
        latencyMs: Date.now() - started,
        status: 'error',
        attrs: { error: err instanceof Error ? err.message : String(err) },
      });
      return { ok: false, summary: `code_exec failed: ${err instanceof Error ? err.message : String(err)}`, artifactIds: [] };
    }
  },
};
