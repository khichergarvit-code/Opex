# Session context — resume point

This file is a handoff summary of everything done in the session that built
milestone A1, so a future session (human or agent) can pick up without
re-deriving it. It is not part of the project's own doc conventions
(`docs/PROGRESS.md` is the terse, ≤60-line, always-current status per
CLAUDE.md's workflow rule) — this file is a one-time, denser narrative of
*how we got here*. Safe to delete once its contents are stale or fully
absorbed into `docs/PROGRESS.md`/commit history.

## Where things stand

**A1 (Walking skeleton) is complete and fully verified**, including a live
end-to-end run of the real `make up` stack (not just unit tests). See
`docs/PROGRESS.md` for the terse Status/Decisions/Debt/Open-questions
summary — read that first. This file adds the narrative/how-we-got-here
detail that doesn't belong there.

As of the end of this session, the full stack **was left running**:
- Frontend: http://localhost:8080
- Backend API: http://localhost:3000
- Postgres reachable only from inside the `core` Docker network (by design —
  `internal: true`, see invariant #1). Use `docker compose exec postgres
  psql -U opex -d opex`.
- Seeded users (all share password `opex-dev-password`): `admin@opex.local`
  (super_admin), `wsadmin@opex.local` (workspace_admin),
  `employee.confidential@opex.local` / `employee.internal@opex.local` /
  `employee.public@opex.local` (employee, clearance 2/1/0).

To stop: `make down` (add `-v` to also wipe the `pgdata` volume — don't do
that unless you want to re-seed from scratch). To restart later: `make up`
— it's fully self-sufficient now (migrations run automatically at API
boot; see below), no manual steps required. Re-run `pnpm seed` (or `docker
exec opex-api-1 node dist/db/seed.js` if only the containers exist) after a
volume wipe.

## What was built (A1 scope)

Full pnpm/TS monorepo from an empty repo: `apps/api` (Express 5 + Drizzle +
Postgres), `apps/web` (React + Vite, minimal chat UI), `packages/shared`
(Zod types), `services/ingest` (FastAPI health-check stub, real ingestion
is A2). Docker Compose stack matching `docs/spec/core.md`'s Stage A service
table, with `core` network `internal: true`. Argon2id auth with
lockout, hand-rolled CSRF, and a `can()` policy engine. The model gateway
(`apps/api/src/models/gateway.ts`) with span-writing, retry/circuit-breaker,
and policy checks on every call. SSE-streamed chat. Manifest SHA-256
verification (`infra/models/manifest.yaml` + `scripts/manifest-check.ts`).

Full detail — file tree, table schema, spike design — is in the approved
plan at `/Users/garvitkhicher/.claude/plans/pasted-content-id-ffea-read-docs-plan-m-soft-ritchie.md`
(outside the repo, in Claude's local plan storage — copy it into the repo
if you want it version-controlled).

## Models actually downloaded and running

Chosen after checking real Hugging Face repos for exact filenames/licenses
(not guessed) — see `docs/PROGRESS.md` Decisions for the one-line
rationale, and `infra/models/manifest.yaml` for the pinned SHA-256s:

| role | file | size | repo |
|---|---|---|---|
| llm-small (router) | `qwen2.5-0.5b-instruct-q4_k_m.gguf` | 491 MB | Qwen/Qwen2.5-0.5B-Instruct-GGUF |
| llm-main (general) | `Qwen2.5-7B-Instruct-Q4_K_M.gguf` | 4.68 GB | bartowski/Qwen2.5-7B-Instruct-GGUF |
| llm-embed | `bge-m3-Q8_0.gguf` | 635 MB | gpustack/bge-m3-GGUF |
| llm-rerank | `bge-reranker-v2-m3-Q8_0.gguf` | 636 MB | gpustack/bge-reranker-v2-m3-GGUF |

All 4 already sit in `./models/` (gitignored — re-download with
`./scripts/fetch-models.sh` on a fresh checkout). llm-main is text-only in
A1 (vision deferred — see Spike B result).

## Real bugs found and fixed during the live demo

Both were only caught because the milestone was demonstrated end-to-end
through the actual compose stack, not just unit tests:

1. **CSRF blocked login itself** — the double-submit CSRF check ran on
   `POST /auth/login` too, but there's no session/token to present before
   you're authenticated. Fixed: `/auth/login` is now exempt
   (`apps/api/src/middleware/csrf.ts`).
2. **`NODE_ENV=production` silently broke every login** —
   `express-session` correctly refuses to ever emit a `secure` cookie over
   plain HTTP (see `node_modules/express-session/index.js`'s `issecure`
   check). Since there's no TLS in front of the API until B6, the compose
   file's `api` service now runs `NODE_ENV: development` deliberately, with
   a comment explaining why (`docker-compose.yml`). Flip it when B6 lands.

Also added along the way, not originally in the written plan:
- `index.ts` now runs DB migrations automatically at boot
  (`apps/api/src/db/migrate.ts` exports `runMigrations`, shared by both the
  boot path and the `db:migrate` CLI script) — confirmed by tearing down
  the Postgres volume entirely and re-running `make up` from empty.
- `services/ingest/pyproject.toml` needed `[tool.pytest.ini_options]
  pythonpath = ["src"]` — uv's editable-install `.pth` ordering wasn't
  reliably putting `src/` on `sys.path` for `import ingest` in tests.

## Infra quirk worth knowing before touching docker-compose.yml

Docker **refuses to publish host ports on a network with `internal:
true`** — not just block egress from it, as you might assume. This means
`postgres` (on `core` only) is *not* reachable from the host at all, by
design and by Docker's own enforcement. Don't add a `ports:` mapping to it
expecting it to work — it silently won't. Reach it via `docker compose exec
postgres psql ...` instead (see `scripts/verify-offline.sh` and the spike
scripts for the pattern).

## Spike results (all 4 done, real data, not simulated)

Full write-ups in `scripts/spikes/results/*.md`. One-line summaries:
- **VRAM (Spike A)**: 4 models don't comfortably fit concurrently on this
  16GB Apple M4 dev machine. Expected finding, not a blocker — Debt for B4
  (llama-swap).
- **json_schema / `--jinja` tool calls (Spike B)**: both PASS on llm-main.
  Vision not attempted (text-only model chosen for A1).
- **Docling throughput (Spike C)**: ~39.3 CPU-s/page (IRS Form 1040, 2
  pages, CPU-only backend).
- **pgvector filtered HNSW (Spike D)**: PASS — 5/5 rows returned even at a
  2%-selectivity ACL filter, default and tuned `ef_search` alike.

## Verification state

`pnpm lint`, `pnpm typecheck`, `pnpm test` (33 API tests + shared +
skipped-by-default LLM smoke test), and `make test` (adds ingest's
`pytest`) are all green as of the last run in this session. The gated
`RUN_LLM_SMOKE_TEST=1` test and the live curl-based walkthrough (login →
project → conversation → streamed chat → spans row → `verify-offline.sh`
PASS 8/8) were both run for real against the live stack, not mocked.

## Not yet done — natural next steps

- **Nothing has been committed to git.** The repo was `git init`'d this
  session but there is no commit yet — everything is currently untracked
  working tree. Decide on the first commit (and whether to split A1 into
  one commit or several) before doing anything destructive with git.
- A2 (Documents — ingestion, retrieval, doc_qa with citations, the viewer)
  is the next milestone per `docs/plan.md`. Its Read line is `documents,
  eval (Seed corpus, Suites)` — don't reuse anything read for A1 without
  re-reading those specs, per the project's "read only the milestone's Read
  line" workflow rule.
- `docs/PROGRESS.md`'s Debt section has the known rough edges (memory
  pressure at 4-model concurrency, no TLS yet, Docling throughput,
  placeholder web styling) — check it before assuming something is
  finished polish rather than intentional walking-skeleton scope.
