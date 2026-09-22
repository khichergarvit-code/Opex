import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { documents } from '../../db/schema/index.js';
import { callSandbox } from './sandboxClient.js';
import { saveArtifacts } from './saveArtifacts.js';
import type { ToolContext, ToolDefinition, ToolResult } from './types.js';

export const makeChartTool: ToolDefinition = {
  name: 'make_chart',
  description:
    'Runs Python/matplotlib code in the sandbox to draw a chart and returns it as a PNG artifact. Optionally reads an uploaded CSV document as input, available at /work/<the document\'s filename> in the code.',
  parameters: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description:
          "Python/matplotlib source. Must call plt.savefig('/work/chart.png') to produce the artifact.",
      },
      csvDocumentId: {
        type: 'string',
        description: 'Optional: an uploaded CSV document id to make available to the code.',
      },
    },
    required: ['code'],
  },
  async execute(args, ctx: ToolContext): Promise<ToolResult> {
    const code = String(args.code ?? '');
    const csvDocumentId = typeof args.csvDocumentId === 'string' ? args.csvDocumentId : undefined;
    const started = Date.now();

    try {
      const files: Array<{ path: string; contentBase64: string }> = [];
      if (csvDocumentId) {
        const [doc] = await ctx.db.select().from(documents).where(eq(documents.id, csvDocumentId)).limit(1);
        if (doc) {
          const filePath = path.resolve(ctx.dataDir, 'files', doc.workspaceId, doc.sha256);
          const bytes = await readFile(filePath);
          files.push({ path: doc.filename, contentBase64: bytes.toString('base64') });
        }
      }

      const result = await callSandbox(ctx.sandboxRunnerUrl, ctx.sandboxSharedSecret, {
        imageId: 'python-3.12-datasci',
        code,
        files,
        timeoutS: 20,
      });
      const producedChart = result.files.some((f) => f.path.endsWith('.png'));
      const artifactIds = await saveArtifacts(ctx, 'chart_png', result.files);

      await ctx.spanWriter.writeSpan({
        traceId: ctx.traceId,
        kind: 'tool',
        name: 'tool.make_chart',
        latencyMs: Date.now() - started,
        status: result.exitCode === 0 && producedChart ? 'ok' : 'error',
        attrs: { exitCode: result.exitCode, producedChart },
      });

      if (result.exitCode !== 0) {
        return { ok: false, summary: `make_chart failed: ${result.stderr.slice(0, 500)}`, artifactIds };
      }
      if (!producedChart) {
        return { ok: false, summary: 'make_chart ran but produced no .png file', artifactIds };
      }
      return { ok: true, summary: 'Chart generated successfully.', artifactIds };
    } catch (err) {
      await ctx.spanWriter.writeSpan({
        traceId: ctx.traceId,
        kind: 'tool',
        name: 'tool.make_chart',
        latencyMs: Date.now() - started,
        status: 'error',
        attrs: { error: err instanceof Error ? err.message : String(err) },
      });
      return { ok: false, summary: `make_chart failed: ${err instanceof Error ? err.message : String(err)}`, artifactIds: [] };
    }
  },
};
