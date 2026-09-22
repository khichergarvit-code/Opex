import type { ToolContext, ToolDefinition, ToolResult } from './types.js';

/**
 * No vision-capable model is loaded (A1 deferred it — llm-main is
 * text-only). Scaffolded so the router/agent/tool-allowlist path is
 * complete for when a vision GGUF is added, but returns a clear
 * unavailable message rather than fabricating a caption. Prominent Debt
 * item — see docs/PROGRESS.md.
 */
export const describeImageTool: ToolDefinition = {
  name: 'describe_image',
  description: 'Describes the contents of an image. Currently unavailable — no vision model is loaded.',
  parameters: {
    type: 'object',
    properties: {
      imageRef: { type: 'string', description: 'Reference to the image to describe.' },
    },
    required: ['imageRef'],
  },
  async execute(_args, ctx: ToolContext): Promise<ToolResult> {
    await ctx.spanWriter.writeSpan({
      traceId: ctx.traceId,
      kind: 'tool',
      name: 'tool.describe_image',
      latencyMs: 0,
      status: 'error',
      attrs: { reason: 'no vision-capable model loaded' },
    });
    return {
      ok: false,
      summary: 'Image description is not available in this deployment: no vision-capable model is loaded.',
      artifactIds: [],
    };
  },
};
