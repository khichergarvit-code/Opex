# Progress

## Status
A1 (Walking skeleton) complete. Monorepo, compose stack, manifest hash
check, hw-probe, verify-offline.sh, seeded-user auth with `can()`, model
gateway, conversations + SSE chat, and a minimal web UI are built and
passing lint/typecheck/tests (33 tests, real Postgres). All 4 A1 spikes ran
with real results (see `scripts/spikes/results/`). `make up` was run from a
completely clean volume (no manual steps) and the full AC was demonstrated
end-to-end through the real published ports: login → project → conversation
→ streamed chat (`ghcr.io/ggml-org/llama.cpp:server`, CPU-only in-container)
→ a `spans` row with token counts → `verify-offline.sh` PASS (8/8
containers blocked).

## Decisions
- GGUF picks (Apache-2.0/MIT, single-file, verified against real HF repos):
  llm-small = Qwen2.5-0.5B-Instruct-Q4_K_M, llm-main = Qwen2.5-7B-Instruct-
  Q4_K_M (bartowski's single-file build — Qwen's own repo splits it into 2
  shards, which the manifest schema doesn't support), llm-embed = bge-m3-
  Q8_0, llm-rerank = bge-reranker-v2-m3-Q8_0. llm-main is text-only in A1;
  vision deferred (Spike B).
- llama-server runs host-native (Metal) for spikes/dev, in-container
  (CPU-only) for `make up` — Docker Desktop on Mac doesn't pass Metal
  through to Linux containers.
- Node 22 target in `engines`, but built with the pre-installed Node 25 — no
  incompatibility observed.
- `core` stays `internal: true` as spec'd. Docker refuses to publish host
  ports on internal-only networks at all, not just block egress — host-side
  migrations/spikes reach Postgres via `docker compose exec ... psql`.
- `orchestrator/`, `memory/`, `retrieval/` directories and `sandbox-runner`
  were not scaffolded — no A1 code belongs there.
- CSRF: `/auth/login` is exempt from the double-submit check (no session
  exists yet before login) — found and fixed via the smoke test.
- `NODE_ENV=development` in `make up`'s compose file, deliberately, not
  `production`: found via the full-stack demo that `production` silently
  broke every login (express-session refuses to ever emit a `secure`
  cookie over plain HTTP — correct behavior, but there's no TLS in front of
  the API until B6). Flip to `production` when B6 adds TLS at the edge.
- `index.ts` now runs migrations at boot (`runMigrations`, shared with
  `db:migrate`'s CLI), not just the manifest check — confirmed by tearing
  down the Postgres volume entirely and re-running `make up` from empty.

## Debt
- Spike A: the 4 models don't comfortably fit in memory concurrently on
  this 16GB dev machine (see `scripts/spikes/results/vram-probe.md`).
  Real fix is llama-swap (B4).
- TLS is not yet in front of the API (`secure` cookie flag is
  environment-gated) — B6 hardening adds it.
- Docling spike measured ~39 CPU-s/page on CPU-only backend; A2 should
  revisit throughput/parallelism once real corpus sizes are known.
- `apps/web`'s inline styles are placeholder UI, not the eventual design —
  fine for a walking skeleton, revisit in A3 (ui.md).

## Open questions
- Exact production GPU box specs (affects whether Q4_K_M is still the right
  quant for llm-main at Stage B) — deferred to B-stage planning.
- Whether Docling's RapidOCR CPU throughput is acceptable for the real A2
  corpus, or a lighter OCR backend should be evaluated.
