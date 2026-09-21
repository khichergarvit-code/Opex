# Memory (apps/api/src/memory)

## Working (A3)
Working memory is the last N turns plus a rolling summary. When it exceeds 60% of its budget, the LLM folds the oldest turns into the summary. The summary must keep numbers, names, decisions, and open questions.

## Long-term (B2)
| type | scope | written | read |
|---|---|---|---|
| episodic | user (optionally project) | when a conversation closes or is idle 30 min: goal, actions, outcome, entities | when the router's needs.memory includes it |
| semantic | user, project, or workspace | extracted after each episode | when the router's needs.memory includes it |
| project | `projects.notes_md`, edited by humans | on edit | always, inside that project |

Write pipeline for semantic memory:
1. The LLM extracts candidates as `{text,type,scope,confidence}`.
2. Drop candidates that contain secrets or PII.
3. Drop candidates with confidence below 0.6.
4. Dedupe: if cosine similarity is above 0.9, merge with or supersede the existing memory, keeping versions.
5. Store with provenance and classification = the maximum classification of the source context.

Read: take the top 5 semantic and top 3 episodic memories above a threshold. Log each injected memory and its score in the trace.

Control:
- Users can view, edit, and delete their own memories. These actions are audited.
- Admins set a TTL per type and workspace, enforced by a nightly purge.
- Decay score is recency × access_count.
- Memory derived from documents or the web is untrusted.

## Context budget
Shares of the model's context window, measured with `/tokenize`. When over budget, trim the lowest-scored items first.
- project ≤10%
- semantic ≤5%
- episodic ≤5%
- chunks ≤40%
- conversation: the remainder
- output reserve ≥20%