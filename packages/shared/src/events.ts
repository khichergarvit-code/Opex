import { z } from 'zod';

/**
 * SSE events streamed from POST /conversations/:id/messages.
 *
 * core.md defines the full event set for the finished product:
 *   route, plan, step_start, status, retrieval, memory_used, tool_call,
 *   approval_required, tool_result, token, citation, verify, done, error
 *
 * A1 has no router, planner, retrieval, memory, tools, or verifier yet, so only
 * the 4 events below are ever emitted in this milestone. The rest are added as
 * the systems that produce them are built (A2 retrieval/citation, A3
 * router/plan/step_start/tool_call/tool_result, B2 memory_used, B3 verify,
 * B4 approval_required).
 */

export const statusEventSchema = z.object({
  type: z.literal('status'),
  data: z.object({
    state: z.enum(['cold_start', 'model_swap']),
    model: z.string(),
  }),
});

export const tokenEventSchema = z.object({
  type: z.literal('token'),
  data: z.object({
    delta: z.string(),
  }),
});

export const doneEventSchema = z.object({
  type: z.literal('done'),
  data: z.object({
    messageId: z.string().uuid(),
    traceId: z.string().uuid(),
  }),
});

export const errorEventSchema = z.object({
  type: z.literal('error'),
  data: z.object({
    message: z.string(),
  }),
});

export const sseEventSchema = z.discriminatedUnion('type', [
  statusEventSchema,
  tokenEventSchema,
  doneEventSchema,
  errorEventSchema,
]);

export type SseEvent = z.infer<typeof sseEventSchema>;
