# Core

## Services
| service | networks | stage | notes |
|---|---|---|---|
| web | edge | A | static build, strict CSP, all assets bundled |
| api | edge, core | A | the only service users reach |
| postgres | core | A | pgvector image |
| llm-small, llm-main, llm-embed, llm-rerank | core | A | llama-server (see models.md) |
| ingest | core | A | Python worker that polls `jobs` |
| sandbox-runner | core, sock | A | the only Docker-socket user |
| docker-socket-proxy | sock | B4 | |
| llm-swap | core | B4 | 24 GB GPUs only |
| egress-gateway | core, external | B6 | compose profile `egress`, off by default |

`core` and `sock` are internal. Every container sets `DO_NOT_TRACK=1`, `HF_HUB_OFFLINE=1`, and `TRANSFORMERS_OFFLINE=1`.

## Request lifecycle
1. Authentication and `can()`.
2. Guardrails on input: size, quota, policy, and an injection heuristic.
3. The router produces a RouteDecision.
4. Simple tasks go to one agent. multi_step tasks go to the planner (B3).
5. The context builder assembles context within the budgets in memory.md.
6. The executor runs tools, up to 8 iterations.
7. The verifier checks the result, with at most 2 revisions.
8. Guardrails on output: DLP, a classification label, and citations.
9. Stream the result over SSE, close the trace, and enqueue memory jobs.

## Data model
Classification and clearance levels are 0 Public, 1 Internal, 2 Confidential, 3 Restricted.
- users(email,name,password_hash,role,clearance,status) · groups · user_groups · workspaces · projects(workspace_id,default_classification,notes_md) · project_members
- documents(project_id,sha256,filename,mime,classification,acl_group_ids[],status,uploaded_by)
- chunks(document_id,workspace_id,project_id,classification,acl_group_ids[],kind,page,bbox,section_path,text,tsv,embedding,suspicious). Indexes: HNSW(embedding), GIN(tsv), GIN(acl_group_ids)
- conversations · messages(conversation_id,role,content,trace_id,classification)
- memories(type,scope,owner_user_id,project_id,workspace_id,text,embedding,classification,provenance,confidence,version,superseded_by,expires_at,access_count,last_accessed_at)
- traces(user_id,conversation_id,status) · spans(trace_id,parent_id,kind,name,model,tokens_in,tokens_out,latency_ms,status,attrs)
- audit_log(ts,actor_id,action,resource,details,prev_hash,hash)
- agents (versioned) · models · tools · policies · access_requests · access_grants · approvals · artifacts · jobs · feedback(trace_id,rating,comment,root_cause)

## API (REST, SSE, Zod)
- `POST /auth/login|logout` · `GET /me`
- `GET|POST /projects` · `POST /projects/:id/documents`
- `GET /documents/:id` · `GET /documents/:id/pages/:n`
- `POST /conversations` · `POST /conversations/:id/messages` (responds over SSE)
- `POST /approvals/:id` · `GET|PATCH|DELETE /me/memories` · `POST /feedback` · `POST /access-requests`
- `/admin/{users,groups,policies,agents,models,tools,access-requests,logs,usage,memory,audit,feedback}`

SSE events, defined in `packages/shared/src/events.ts`: route, plan, step_start, status, retrieval, memory_used, tool_call, approval_required, tool_result, token, citation, verify, done, error.

## Layout
- `apps/web`
- `apps/api/src/{models,policy,orchestrator,memory,retrieval,prompts}`
- `services/ingest`, `services/sandbox-runner`
- `packages/shared`, `infra`, `scripts`, `eval`, `docs`