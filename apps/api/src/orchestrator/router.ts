import { z } from 'zod';
import type { ModelGateway } from '../models/gateway.js';
import type { AuthedUser } from '../policy/types.js';
import type { Attachment, RouteDecision } from './types.js';

const ROUTE_DECISION_SCHEMA = {
  name: 'route_decision',
  schema: {
    type: 'object',
    properties: {
      task_type: { type: 'string', enum: ['chat', 'doc_qa', 'analysis', 'code', 'research', 'vision'] },
      complexity: { type: 'string', enum: ['simple', 'multi_step'] },
      agent: { type: 'string', enum: ['general', 'doc_qa', 'vision', 'analysis'] },
      needs: {
        type: 'object',
        properties: {
          documents: { type: 'boolean' },
          memory: { type: 'array', items: { type: 'string' } },
          tools: { type: 'array', items: { type: 'string' } },
        },
        required: ['documents', 'memory', 'tools'],
      },
      reason: { type: 'string' },
    },
    required: ['task_type', 'complexity', 'agent', 'needs', 'reason'],
  },
};

const routerResponseSchema = z.object({
  task_type: z.enum(['chat', 'doc_qa', 'analysis', 'code', 'research', 'vision']),
  complexity: z.enum(['simple', 'multi_step']),
  // Constrained to the 4 real agents (not z.string()): llm-small is a 0.5B
  // model and, unconstrained, would sometimes echo a schema field name or
  // other free-form text as the value. Because conversations.ts branches on
  // an exact string match against 'doc_qa'/'vision'/'analysis', an
  // unvalidated value here silently fell through to plain chat even when
  // task_type correctly said 'doc_qa' — found via a live eval run where the
  // model returned agent:"agent" and doc_qa never fired.
  agent: z.enum(['general', 'doc_qa', 'vision', 'analysis']),
  needs: z.object({
    documents: z.boolean(),
    memory: z.array(z.string()),
    tools: z.array(z.string()),
  }),
  reason: z.string(),
});

const IMAGE_MIME_PREFIX = 'image/';
const TABULAR_MIMES = new Set([
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export interface RouteInput {
  message: string;
  attachments: Attachment[];
  hasReadyDocuments: boolean;
  gateway: ModelGateway;
  user: AuthedUser;
  traceId: string;
}

function ruleBasedRoute(input: RouteInput): RouteDecision | null {
  if (input.attachments.some((a) => a.mime.startsWith(IMAGE_MIME_PREFIX))) {
    return {
      taskType: 'vision',
      complexity: 'simple',
      agent: 'vision',
      needs: { documents: false, memory: [], tools: ['describe_image'] },
      reason: 'image attachment present',
    };
  }
  if (input.attachments.some((a) => TABULAR_MIMES.has(a.mime))) {
    return {
      taskType: 'analysis',
      complexity: 'simple',
      agent: 'analysis',
      needs: { documents: false, memory: [], tools: ['code_exec', 'make_chart'] },
      reason: 'tabular attachment present',
    };
  }
  const trimmed = input.message.trim();
  if (trimmed.startsWith('/doc')) {
    return {
      taskType: 'doc_qa',
      complexity: 'simple',
      agent: 'doc_qa',
      needs: { documents: true, memory: [], tools: ['doc_search'] },
      reason: '/doc forces the doc_qa agent',
    };
  }
  if (trimmed.startsWith('/code')) {
    // The real `code` agent is B3 — /code routes to `analysis` in A3, the
    // closest agent with code_exec access (documented gap, see the plan).
    return {
      taskType: 'code',
      complexity: 'simple',
      agent: 'analysis',
      needs: { documents: false, memory: [], tools: ['code_exec'] },
      reason: '/code forces analysis (no dedicated code agent until B3)',
    };
  }
  return null;
}

function fallbackRoute(input: RouteInput, reason: string): RouteDecision {
  if (input.hasReadyDocuments) {
    return {
      taskType: 'doc_qa',
      complexity: 'simple',
      agent: 'doc_qa',
      needs: { documents: true, memory: [], tools: ['doc_search'] },
      reason,
    };
  }
  return {
    taskType: 'chat',
    complexity: 'simple',
    agent: 'general',
    needs: { documents: false, memory: [], tools: [] },
    reason,
  };
}

/**
 * Rule pre-checks run first (orchestration.md). If none match, llm-small
 * classifies via JSON; a parse failure falls back to the rules.
 */
export async function route(input: RouteInput): Promise<RouteDecision> {
  const ruleMatch = ruleBasedRoute(input);
  if (ruleMatch) return ruleMatch;

  try {
    const result = await input.gateway.chat({
      role: 'router',
      messages: [
        {
          role: 'system',
          content:
            'Classify the user message into task_type/complexity/agent/needs/reason per the JSON schema. agent must be one of: general, doc_qa, vision, analysis. reason must be 20 words or fewer.',
        },
        { role: 'user', content: input.message },
      ],
      jsonSchema: ROUTE_DECISION_SCHEMA,
      user: input.user,
      traceId: input.traceId,
    });
    const parsed = routerResponseSchema.safeParse(JSON.parse(result.content));
    if (parsed.success) {
      return {
        taskType: parsed.data.task_type,
        complexity: parsed.data.complexity,
        agent: parsed.data.agent,
        needs: parsed.data.needs,
        reason: parsed.data.reason,
      };
    }
  } catch {
    // fall through to the rules fallback below
  }

  return fallbackRoute(input, 'fallback: router JSON classification failed to parse');
}
