import { z } from 'zod';

/**
 * SSE events streamed from POST /conversations/:id/messages.
 *
 * core.md defines the full event set for the finished product:
 *   route, plan, step_start, status, retrieval, memory_used, tool_call,
 *   approval_required, tool_result, token, citation, verify, done, error
 *
 * A1 shipped status/token/done/error. A2 adds citation (doc_qa's answer
 * source mapping). A3 adds route/tool_call/tool_result/verify. The rest
 * (plan/step_start/memory_used/approval_required) are added as the systems
 * that produce them are built (B2 memory_used, B3 plan/step_start, B4
 * approval_required).
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

const bboxSchema = z.object({
  x0: z.number(),
  y0: z.number(),
  x1: z.number(),
  y1: z.number(),
});

export const citationEventSchema = z.object({
  type: z.literal('citation'),
  data: z.object({
    marker: z.number().int(),
    documentId: z.string().uuid(),
    filename: z.string(),
    page: z.number().int(),
    bbox: bboxSchema,
  }),
});
export type CitationEvent = z.infer<typeof citationEventSchema>;

export const routeEventSchema = z.object({
  type: z.literal('route'),
  data: z.object({
    taskType: z.enum(['chat', 'doc_qa', 'analysis', 'code', 'research', 'vision']),
    agent: z.string(),
    complexity: z.enum(['simple', 'multi_step']),
    reason: z.string(),
  }),
});
export type RouteEvent = z.infer<typeof routeEventSchema>;

export const toolCallEventSchema = z.object({
  type: z.literal('tool_call'),
  data: z.object({
    toolName: z.string(),
    callId: z.string(),
    args: z.record(z.string(), z.unknown()),
  }),
});
export type ToolCallEvent = z.infer<typeof toolCallEventSchema>;

export const toolResultEventSchema = z.object({
  type: z.literal('tool_result'),
  data: z.object({
    callId: z.string(),
    status: z.enum(['ok', 'error']),
    summary: z.string(),
    artifactIds: z.array(z.string().uuid()).default([]),
  }),
});
export type ToolResultEvent = z.infer<typeof toolResultEventSchema>;

export const verifyEventSchema = z.object({
  type: z.literal('verify'),
  data: z.object({
    ok: z.boolean(),
    uncitedClaims: z.number().int(),
    // B3b: set for doc_qa's groundedness revise loop and the code-task
    // check; absent from any other verify emitter (backward compatible).
    confidence: z.enum(['high', 'low']).optional(),
    revisions: z.number().int().optional(),
  }),
});
export type VerifyEvent = z.infer<typeof verifyEventSchema>;

export const memoryUsedEventSchema = z.object({
  type: z.literal('memory_used'),
  data: z.object({
    id: z.string().uuid(),
    kind: z.enum(['episodic', 'semantic', 'project']),
    score: z.number().optional(), // absent for project notes (no scoring)
  }),
});
export type MemoryUsedEvent = z.infer<typeof memoryUsedEventSchema>;

/** A fact about the user was just saved to long-term memory (shown with a Forget option). */
export const memorySavedEventSchema = z.object({
  type: z.literal('memory_saved'),
  data: z.object({ id: z.string().uuid(), text: z.string() }),
});
export type MemorySavedEvent = z.infer<typeof memorySavedEventSchema>;

export const planStepSchema = z.object({
  id: z.string(),
  agent: z.string(),
  goal: z.string(),
  inputsFrom: z.array(z.string()),
});

export const planEventSchema = z.object({
  type: z.literal('plan'),
  data: z.object({
    steps: z.array(planStepSchema),
  }),
});
export type PlanEvent = z.infer<typeof planEventSchema>;

export const stepStartEventSchema = z.object({
  type: z.literal('step_start'),
  data: z.object({
    stepId: z.string(),
    agent: z.string(),
    goal: z.string(),
  }),
});
export type StepStartEvent = z.infer<typeof stepStartEventSchema>;

export const approvalRequiredEventSchema = z.object({
  type: z.literal('approval_required'),
  data: z.object({
    approvalId: z.string().uuid(),
    toolName: z.string(),
    args: z.record(z.string(), z.unknown()),
    reason: z.string(),
  }),
});
export type ApprovalRequiredEvent = z.infer<typeof approvalRequiredEventSchema>;

export const progressEventSchema = z.object({
  type: z.literal('progress'),
  data: z.object({
    phase: z.enum(['routing', 'retrieving', 'generating', 'verifying', 'revising', 'tool', 'planning']),
    label: z.string(),
  }),
});
export type ProgressEvent = z.infer<typeof progressEventSchema>;

/** Replaces the whole answer text shown so far (empty string clears it before a revision streams). */
export const replaceEventSchema = z.object({
  type: z.literal('replace'),
  data: z.object({ text: z.string() }),
});
export type ReplaceEvent = z.infer<typeof replaceEventSchema>;

/** Where the answer came from — lets the UI say plainly when it is NOT grounded in the user's documents. */
export const sourceEventSchema = z.object({
  type: z.literal('source'),
  data: z.object({ kind: z.enum(['documents', 'general']) }),
});
export type SourceEvent = z.infer<typeof sourceEventSchema>;

/** The server id of the user message just saved (needed to edit it without a reload). */
export const userSavedEventSchema = z.object({
  type: z.literal('user_saved'),
  data: z.object({ messageId: z.string().uuid() }),
});
export type UserSavedEvent = z.infer<typeof userSavedEventSchema>;

export const sseEventSchema = z.discriminatedUnion('type', [
  statusEventSchema,
  tokenEventSchema,
  doneEventSchema,
  errorEventSchema,
  citationEventSchema,
  routeEventSchema,
  toolCallEventSchema,
  toolResultEventSchema,
  verifyEventSchema,
  memoryUsedEventSchema,
  memorySavedEventSchema,
  approvalRequiredEventSchema,
  planEventSchema,
  stepStartEventSchema,
  progressEventSchema,
  replaceEventSchema,
  sourceEventSchema,
  userSavedEventSchema,
]);

export type SseEvent = z.infer<typeof sseEventSchema>;
