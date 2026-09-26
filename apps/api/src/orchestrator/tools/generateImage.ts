import { saveArtifactRecords } from './saveArtifacts.js';
import type { ToolContext, ToolDefinition, ToolResult } from './types.js';

const MAX_SIDE = 768;
const snap = (n: unknown): number => {
  const v = Number(n);
  if (!Number.isFinite(v)) return 512;
  return Math.min(MAX_SIDE, Math.max(256, Math.round(v / 64) * 64));
};

export const generateImageTool: ToolDefinition = {
  name: 'generate_image',
  description:
    'Creates one new image from a text description using the local image model and shows it to the user. ' +
    'Write a detailed visual prompt: subject, style, lighting, composition.',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Detailed description of the image to create.' },
      width: { type: 'number', description: 'Width in pixels (256-768, multiple of 64). Default 512.' },
      height: { type: 'number', description: 'Height in pixels (256-768, multiple of 64). Default 512.' },
    },
    required: ['prompt'],
  },
  async execute(args, ctx: ToolContext): Promise<ToolResult> {
    const prompt = String(args.prompt ?? '').trim();
    if (!prompt) return { ok: false, summary: 'No prompt was given.', artifactIds: [] };
    try {
      const { png } = await ctx.gateway.generateImage({
        prompt,
        width: snap(args.width),
        height: snap(args.height),
        user: ctx.user,
        traceId: ctx.traceId,
      });
      const records = await saveArtifactRecords(ctx, 'image', [
        { path: `generated-${Date.now()}.png`, contentBase64: png.toString('base64') },
      ]);
      return { ok: true, summary: 'Image generated and shown to the user.', artifactIds: records.map((r) => r.id), artifacts: records };
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const notRunning = /No enabled model configured|fetch failed|ECONNREFUSED|image server 5\d\d|Circuit open/i.test(raw);
      return {
        ok: false,
        summary: notRunning
          ? 'Image generation is not running on this server. Start it with scripts/run-native-imagegen (see RUNNER.md).'
          : `Image generation failed: ${raw.slice(0, 200)}`,
        artifactIds: [],
      };
    }
  },
};
