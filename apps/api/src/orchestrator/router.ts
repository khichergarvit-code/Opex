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
      agent: { type: 'string', enum: ['general', 'doc_qa', 'vision', 'analysis', 'code', 'research'] },
      needs: {
        type: 'object',
        properties: {
          documents: { type: 'boolean' },
          // B2: which long-term memory types to inject, if any. Project
          // notes are always injected regardless (memory.md: "always,
          // inside that project") — not a router decision.
          memory: { type: 'array', items: { type: 'string', enum: ['semantic', 'episodic'] } },
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
  agent: z.enum(['general', 'doc_qa', 'vision', 'analysis', 'code', 'research']),
  needs: z.object({
    documents: z.boolean(),
    memory: z.array(z.enum(['semantic', 'episodic'])),
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
      needs: { documents: false, memory: [], tools: [] },
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
    return {
      taskType: 'code',
      complexity: 'simple',
      agent: 'code',
      needs: { documents: false, memory: [], tools: ['code_exec', 'make_chart'] },
      reason: '/code forces the code agent',
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

// Few-shot examples targeting the exact, confirmed failure mode: a live
// eval run (eval/results/2026-09-22.md) found all 9/32 router failures
// were plain-English document questions (no attachment, no /doc prefix)
// on a project with ready documents, classified as "general" instead of
// "doc_qa" — llm-small (0.5B) had no in-prompt signal that documents even
// existed, and its `reason` fields showed format degeneration (literally
// echoing the schema, e.g. "description_of_task").
//
// The first version of this fix overcorrected: a second live eval run
// (with the "prefer doc_qa when documents exist" instruction added but no
// negative examples) found the model then over-routed greetings, thanks,
// meta-questions about the assistant, and arithmetic to doc_qa too (e.g.
// "hi" -> doc_qa, "what's 12 times 8?" -> doc_qa). The negative examples
// below are there specifically to counterbalance that — pulled straight
// from the questions that regressed. Only shown when hasReadyDocuments is
// true, since the positive-only advice caused the regression in the
// first place.
const DOC_QA_FEW_SHOTS = `
Examples (this project has ready documents):
Q: "What is the torque spec for the discharge flange bolts?"
A: {"task_type":"doc_qa","complexity":"simple","agent":"doc_qa","needs":{"documents":true,"memory":[],"tools":["doc_search"]},"reason":"asks for a spec value likely found in an uploaded document"}
Q: "Who inspected the boiler feed pump?"
A: {"task_type":"doc_qa","complexity":"simple","agent":"doc_qa","needs":{"documents":true,"memory":[],"tools":["doc_search"]},"reason":"asks about a past inspection likely recorded in a document"}
Q: "hi, how are you?"
A: {"task_type":"chat","complexity":"simple","agent":"general","needs":{"documents":false,"memory":[],"tools":[]},"reason":"a plain greeting, not a content question"}
Q: "thanks, that's all for now"
A: {"task_type":"chat","complexity":"simple","agent":"general","needs":{"documents":false,"memory":[],"tools":[]},"reason":"a closing remark, not a content question"}
Q: "can you explain what OpeX is?"
A: {"task_type":"chat","complexity":"simple","agent":"general","needs":{"documents":false,"memory":[],"tools":[]},"reason":"asks about the assistant itself, not the uploaded documents"}
Q: "what's 12 times 8?"
A: {"task_type":"chat","complexity":"simple","agent":"general","needs":{"documents":false,"memory":[],"tools":[]},"reason":"a plain arithmetic question, not a document lookup"}
`.trim();

// Found via a live end-to-end memory demo: the base prompt's one-sentence
// instruction alone did not reliably set needs.memory even for a message
// that explicitly says "based on what I told you earlier" — llm-small
// needs a concrete example of this exact pattern, same lesson as
// DOC_QA_FEW_SHOTS above. Shown regardless of hasReadyDocuments, since
// memory recall isn't document-dependent.
const MEMORY_FEW_SHOT = `
Example (referencing a past preference/decision):
Q: "What units do I prefer for torque values, based on what I told you earlier?"
A: {"task_type":"chat","complexity":"simple","agent":"general","needs":{"documents":false,"memory":["semantic","episodic"],"tools":[]},"reason":"asks the assistant to recall a preference stated earlier"}
`.trim();

// Found via a live check (route-debug, repeated trials): without an
// example, llm-small essentially never produced complexity:"multi_step",
// even for a message with two clearly separable sub-tasks. The negative
// example guards against the same overcorrection DOC_QA_FEW_SHOTS had to
// fix — a message that's just one task phrased in two sentences must stay
// "simple".
const MULTI_STEP_FEW_SHOT = `
Example (two genuinely separable sub-tasks, one feeding the other):
Q: "First find the torque spec for the discharge flange bolts, then explain what that number means for a new technician."
A: {"task_type":"doc_qa","complexity":"multi_step","agent":"doc_qa","needs":{"documents":true,"memory":[],"tools":["doc_search"]},"reason":"two separable sub-tasks: find a spec, then explain it"}
Example (one task, not multi_step even though it has two sentences):
Q: "What is the torque spec for the discharge flange bolts? Please cite the page."
A: {"task_type":"doc_qa","complexity":"simple","agent":"doc_qa","needs":{"documents":true,"memory":[],"tools":["doc_search"]},"reason":"a single factual lookup, citing is not a separate sub-task"}
`.trim();

function buildRouterSystemPrompt(hasReadyDocuments: boolean): string {
  const base =
    'Classify the user message into task_type/complexity/agent/needs/reason per the JSON schema. ' +
    'agent must be one of: general, doc_qa, vision, analysis, code, research. ' +
    'reason must be 20 words or fewer and must describe the classification decision itself — ' +
    'never restate the schema, and never say things like "description of task". ' +
    'Include "semantic" or "episodic" in needs.memory if the user references a past preference, ' +
    'decision, or something said in an earlier conversation. ' +
    'complexity is "multi_step" ONLY when the request has two or more genuinely separable ' +
    'sub-tasks (e.g. find X, then use X to do Y) — most requests are "simple", even long or ' +
    `multi-sentence ones.\n\n${MEMORY_FEW_SHOT}\n\n${MULTI_STEP_FEW_SHOT}`;
  if (!hasReadyDocuments) {
    return `${base}\n\nThis project has NO ready ingested documents yet. Do not route to doc_qa.`;
  }
  return (
    `${base}\n\nThis project HAS ready ingested documents. Route to doc_qa ONLY when the message ` +
    `asks about specific factual content (a spec, a value, a name, an event) that a document could ` +
    `plausibly contain. Greetings, thanks/closings, small talk, questions about the assistant itself, ` +
    `and plain arithmetic are ALWAYS "general", never doc_qa, even on a project with documents.` +
    `\n\n${DOC_QA_FEW_SHOTS}`
  );
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
        { role: 'system', content: buildRouterSystemPrompt(input.hasReadyDocuments) },
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
