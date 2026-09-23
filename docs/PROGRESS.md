# Progress

## Status
A1–A3: see `docs/archive/a1-a3.md`. B1+B5: see `docs/archive/b1-b5.md`.

**B2 (Memory), B3 (Orchestration), and B4 (Sandbox + tools) are done.**
All ACs demonstrated live against the running Docker stack: a
preference from chat A is recalled in chat B, deletion stops the
recall, Restricted memory never reaches an Internal user
(`eval/suites/memory.ts`, 3/3); router accuracy ≥0.85; groundedness
catches a seeded unsupported claim and reports confidence/revisions
(`eval/suites/groundedness.ts`, 2/2); two sandboxed calls ran
concurrently (~2.7s for two 2s sleeps, not ~5.4s); the full approval
flow — `approval_required` → real Postgres row → **`docker compose
restart api`** → decide against the restarted process → tool actually
runs — works end to end, including a real `persist=true` write through
a real `docker-socket-proxy`; the escape suite (10 real-Docker tests)
is green. 192 API tests green (up from 148). Full `pnpm eval`
regeneration deferred to a follow-up pass.

**Frontend redesign (Tailwind + `motion`) is done.** All 19 pages
restyled on shared `components/ui/` primitives; new self-scoped
`GET /memory/mine` verified live vs. two seeded users (disjoint rows,
no cross-user leak); found/fixed a real gap: `nginx.conf` lacked
`/approvals`+`/memory` proxies.

## Decisions
- Memory: every injected memory goes in a labeled user-turn block, never
  the system prompt (invariant #5); extraction/purge is an in-process interval.
- B4: the requester or an admin may decide an approval. `persist=true`
  mounts a per-project host directory — sandbox-runner's bind-mount
  source must be the real *host* path, not its container-internal view
  (Docker-outside-of-Docker), fixed via a second, mount-only env var.
  `docker-socket-proxy` allowlists only `CONTAINERS`+`POST` (+`INFO`
  for the next milestone's runtime probe).
- B3: groundedness fails toward the old marker-presence check on a
  parse failure, not toward maximal distrust. Revise loop: 3 attempts,
  non-streaming (accepted latency cost). Batch tool calls run via
  `Promise.allSettled` but still pause on the first approval-required
  call. The scheduler runs in waves; each step gets its own trace so
  an approval pause can't fight the top-level turn's finalization.
- Router: added few-shots for `needs.memory`/`complexity:multi_step` —
  same schema-echoing lesson already fixed once for doc_qa.

## Debt
- Router non-determinism spans `agent`/`needs.memory`/`complexity` —
  identical prompts sometimes classify differently. One open case:
  `/route-debug` got 3/3 `multi_step` for a prompt 3 real chats
  classified `simple` every time.
- A plan step pausing for approval gets no plan-level checkpoint; its
  row stays pending/times out on its own trace while synthesis
  proceeds with a visible, explained gap.
- `agents.memoryPolicy` (jsonb) unused. `runtime=runsc` inert (only
  `runc` registered). Full 7-suite `pnpm eval` hasn't re-run since
  B2–B4; each suite was verified in isolation.

## Open questions
- Real production GPU box specs. Tesseract's Hindi OCR on a
  *rasterized* page. Whether plan-level approval checkpointing is
  worth building before ship.
