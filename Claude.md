# OpeX
Offline on-prem agentic AI workbench for confidential industrial documents. Open-weight models run via llama.cpp. Nothing leaves the room.

## Invariants: never weaken these; if one blocks you, stop and ask
1. No runtime egress. Core Docker networks are `internal: true`. Only `egress-gateway` (B6, off by default) can reach out.
2. No telemetry and no CDN assets anywhere.
3. Models load only from `models/` and must match the SHA-256 in `infra/models/manifest.yaml`.
4. ACL and classification filters go inside the retrieval SQL. Never filter after retrieval.
5. Document, OCR, tool, and web text is untrusted. Put it in labeled blocks in user content, never in system prompts.
6. Every LLM, retrieval, memory, tool, and policy action writes a span with tokens, latency, and status.
7. `audit_log` is append-only, enforced by a DB trigger. The hash chain is added in B1.
8. Generated code runs only via `sandbox-runner`, which is the only Docker-socket user. The socket proxy and gVisor come in B4.
9. Derived data (chunks, memories, summaries, artifacts) inherits the highest classification of its sources.
10. Once a task touches Confidential+ data, outbound tools are disabled for that task.

## Stack
React+TS+Vite · Express 5+TS, Zod, Drizzle · Python FastAPI + Docling (ingest, runs on CPU) · Postgres 16 + pgvector + FTS (Postgres is also the job queue) · llama-server · Docker Compose. The agent loop is our own; do not use LangChain.

## Rules
- Call models only via `apps/api/src/models/gateway.ts`. Make authorization decisions only via `can()` in `apps/api/src/policy/`.
- Keep prompts in `apps/api/src/prompts/*.md`. Small-model JSON uses schema-constrained decoding plus Zod validation.
- Shared API types live in `packages/shared`. Never edit a committed migration.
- Before adding a dependency, confirm it works offline and has no telemetry.

## Workflow
- Current stage: **A (prototype)**.
- Work one milestone at a time from `docs/plan.md`. Read only the `docs/spec/<name>.md` files listed on the milestone's **Read** line.
- A milestone is done when lint, typecheck, and tests pass and its acceptance criteria are demonstrated with commands. Then update `docs/PROGRESS.md` and stop.
- `docs/PROGRESS.md` stays under 60 lines, with these sections: Status, Decisions, Debt, Open questions. Move notes from finished milestones to `docs/archive/`.

## Commands (keep current)
`pnpm dev` · `pnpm test` · `pnpm lint` · `pnpm typecheck` · `make up` · `./scripts/fetch-models.sh` · `./scripts/verify-offline.sh` · `pnpm seed` · `pnpm eval`