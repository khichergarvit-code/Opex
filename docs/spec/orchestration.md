# Orchestration (apps/api/src/orchestrator)

## Agents are config
Agents live in the `agents` table, versioned. Admins can edit them from B3.

Fields: name, description, system_prompt_template, model_role, tool_allowlist, memory_policy, max_iterations, requires_approval_tools, enabled, allowed_groups.

Stage A agents: general (on small), plus doc_qa, vision, and analysis (on main). B3 adds code, research, and custom agents.

## Router
Rules run first:
- An image attachment routes to vision.
- A CSV or XLSX attachment routes to analysis.
- `/doc` or `/code` forces that agent.

Otherwise llm-small returns JSON matching this schema:
`{task_type: chat|doc_qa|analysis|code|research|vision, complexity: simple|multi_step, agent, needs:{documents, memory[], tools[]}, reason (≤20 words)}`

If the JSON fails to parse, fall back to the rules.

## Planner and scheduler (B3)
The planner runs only for multi_step tasks. It returns `steps[{id,agent,goal,inputs_from[],tools[]}]` with at most 6 steps.
- Independent steps run concurrently, within the model's concurrency limit.
- Outputs pass between steps as labeled blocks.
- The general agent writes the final synthesis.

## Executor
- Uses native tool calls via `--jinja`, with a JSON fallback.
- Limits: 8 iterations, a wall-clock limit, and a token budget.
- Before each tool call, check the agent's allowlist and `can()`.

## Verifier
- A3: a deterministic check that every `[n]` maps to a retrieved chunk.
- B3:
  - Check each sentence for groundedness with llm-small, labelling it supported, partial, or unsupported.
  - For code tasks, require exit code 0 and that artifacts exist and are referenced.
  - Run policy and format checks.
- Any unsupported claim triggers a revise with feedback. After at most 2 revisions, return the answer with `confidence: low`.