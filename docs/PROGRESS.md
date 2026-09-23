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

## Decisions
- Memory: every injected memory goes in a labeled user-turn block,
  never the system prompt, regardless of provenance (invariant #5).
  Extraction/purge is an in-process interval, not a new container.
- B4: the requester or an admin may decide an approval.
  `persist=true` mounts a per-project host directory — live testing
  found sandbox-runner's bind-mount source must be the real *host*
  path, not its own container-internal view (Docker-outside-of-Docker),
  fixed with a second env var used only for the mount source.
  `docker-socket-proxy` allowlists only `CONTAINERS`+`POST`
  (+`INFO` for the next milestone's runtime probe).
- B3: groundedness fails toward the old deterministic marker-presence
  check on a parse failure, not toward maximal distrust. The revise
  loop is 3 attempts, non-streaming (confirmed with the user as the
  accepted latency cost). Independent tool calls in a batch run via
  `Promise.allSettled`; the batch still pauses on the first
  approval-required call, deferring any others. The scheduler runs in
  waves; each executor-routed step gets its own trace, so a step's
  approval pause can't fight the top-level turn's finalization.
- Router: added few-shots for `needs.memory` and `complexity:multi_step`
  — the same schema-echoing/never-picks-this-value lesson already fixed
  once for doc_qa, now three instances of the identical failure mode.

## Debt
- Router non-determinism now spans three fields (`agent`, `needs.memory`,
  `complexity`) — confirmed live, identical prompts sometimes classify
  differently. `eval/suites/memory.ts` retries up to 6x. One open,
  unexplained case: `/route-debug` got 3/3 `multi_step` for a prompt
  that 3 real chat attempts classified `simple` every time.
- A plan step that pauses for approval gets no plan-level checkpoint —
  its real approval row stays pending/times out on its own trace; the
  synthesis proceeds with a visible, explained gap instead of waiting.
- `agents.memoryPolicy` (jsonb) unused. `runtime=runsc` wired but inert
  (only `runc` registered here). `pnpm eval`'s full 7-suite regeneration
  hasn't re-run since B2–B4 landed; each suite was verified in isolation.

## Open questions
- Real production GPU box specs. Tesseract's Hindi OCR on a
  *rasterized* page. Whether plan-level approval checkpointing is
  worth building before ship.
