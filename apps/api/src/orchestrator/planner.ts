import { z } from 'zod';
import type { ModelGateway } from '../models/gateway.js';
import type { AuthedUser } from '../policy/types.js';

export interface PlanStep {
  id: string;
  agent: string;
  goal: string;
  inputsFrom: string[];
  tools: string[];
}

export interface Plan {
  steps: PlanStep[];
}

const PLAN_SCHEMA = {
  name: 'plan',
  schema: {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            agent: { type: 'string' },
            goal: { type: 'string' },
            inputs_from: { type: 'array', items: { type: 'string' } },
            tools: { type: 'array', items: { type: 'string' } },
          },
          required: ['id', 'agent', 'goal', 'inputs_from', 'tools'],
        },
      },
    },
    required: ['steps'],
  },
};

const planResponseSchema = z.object({
  steps: z
    .array(
      z.object({
        id: z.string(),
        agent: z.string(),
        goal: z.string(),
        inputs_from: z.array(z.string()),
        tools: z.array(z.string()),
      }),
    )
    .max(6),
});

// Found via a live run: llm-small sometimes echoes the literal schema field
// name "inputs_from" as a string value inside the array, instead of either
// [] or a real step id — the same schema-echoing failure mode documented
// elsewhere in this codebase (router.ts's reason field, memory's needs
// field). A concrete example fixes it, same lesson each time.
const PLAN_SYSTEM_PROMPT =
  'Break this request into at most 6 steps per the JSON schema. Each step names an agent ' +
  '(general, doc_qa, vision, analysis, code, research), a short goal, which other step ids its ' +
  'input comes from (inputs_from — an array of other steps\' id values, or [] if none), and any ' +
  'tools it may need. Independent steps (empty or already-covered inputs_from) run concurrently. ' +
  "Keep steps to genuinely separable work — most requests need only 1-2 steps; don't invent steps " +
  'that aren\'t needed.\n\n' +
  'Example:\n' +
  'Q: "Find the torque spec for the discharge flange bolts, then explain what it means for a new technician."\n' +
  'A: {"steps":[' +
  '{"id":"find_spec","agent":"doc_qa","goal":"find the torque spec for the discharge flange bolts","inputs_from":[],"tools":["doc_search"]},' +
  '{"id":"explain","agent":"general","goal":"explain what the spec found in find_spec means for a new technician","inputs_from":["find_spec"],"tools":[]}' +
  ']}\n' +
  'Note inputs_from holds real step id values from this same plan (like "find_spec") or is empty — never the literal text "inputs_from" itself.';

/**
 * orchestration.md, B3: "The planner runs only for multi_step tasks." One
 * JSON-schema-constrained call, same pattern as router.ts including its
 * fail-safe fallback: a parse failure or empty steps array degrades to a
 * single general-agent step over the original message, never a thrown
 * error.
 */
export async function planTask(
  deps: { gateway: ModelGateway; user: AuthedUser; traceId: string },
  message: string,
): Promise<Plan> {
  try {
    const result = await deps.gateway.chat({
      role: 'router',
      messages: [
        { role: 'system', content: PLAN_SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
      jsonSchema: PLAN_SCHEMA,
      user: deps.user,
      traceId: deps.traceId,
    });
    const parsed = planResponseSchema.safeParse(JSON.parse(result.content));
    if (parsed.success && parsed.data.steps.length > 0) {
      return {
        steps: parsed.data.steps.map((s) => ({ id: s.id, agent: s.agent, goal: s.goal, inputsFrom: s.inputs_from, tools: s.tools })),
      };
    }
  } catch {
    // fall through to the single-step fallback below
  }
  return { steps: [{ id: 'step1', agent: 'general', goal: message, inputsFrom: [], tools: [] }] };
}
