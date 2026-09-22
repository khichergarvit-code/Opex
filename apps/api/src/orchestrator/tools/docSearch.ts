import { loadUserGroupIds } from '../../routes/docQa.js';
import { search } from '../../retrieval/index.js';
import type { ToolContext, ToolDefinition, ToolResult } from './types.js';

/**
 * The `research` agent's real tool version of retrieval — unlike doc_qa,
 * which builds its own prompt directly, `research` goes through
 * runExecutor and needs an actual callable tool. Reuses retrieval/
 * index.ts's search() (same ACL-filtered SQL, invariant #4) rather than
 * any new retrieval logic.
 */
export const docSearchTool: ToolDefinition = {
  name: 'doc_search',
  description: 'Searches ingested project documents and returns matching passages with citation markers.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to search for.' },
    },
    required: ['query'],
  },
  async execute(args, ctx: ToolContext): Promise<ToolResult> {
    const query = String(args.query ?? '');
    const started = Date.now();
    const groupIds = await loadUserGroupIds(ctx.db, ctx.user.id);
    const outcome = await search(
      { db: ctx.db, gateway: ctx.gateway, spanWriter: ctx.spanWriter, user: ctx.user, traceId: ctx.traceId },
      {
        workspaceId: ctx.workspaceId,
        projectIds: [ctx.projectId],
        userId: ctx.user.id,
        clearance: ctx.user.clearance,
        groupIds,
        query,
      },
    );
    await ctx.spanWriter.writeSpan({
      traceId: ctx.traceId,
      kind: 'tool',
      name: 'tool.doc_search',
      latencyMs: Date.now() - started,
      status: 'ok',
      attrs: { noSupport: outcome.noSupport, chunkCount: outcome.chunks.length },
    });
    if (outcome.noSupport) {
      return { ok: false, summary: 'No supporting passages were found for this query.', artifactIds: [] };
    }
    const summary = outcome.chunks
      .map((c, i) => `[${i + 1}] (${c.documentId}, p.${c.page}) ${c.text.slice(0, 300)}`)
      .join('\n');
    return { ok: true, summary, artifactIds: [] };
  },
};
