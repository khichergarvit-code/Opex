# Progress

## Status
A1–A3: `docs/archive/a1-a3.md`. B1+B5: `docs/archive/b1-b5.md`.

**B2 (Memory), B3 (Orchestration), B4 (Sandbox + tools) are done** — acceptance evidence in `docs/archive/b2-b4.md`.

**Chat + models (this pass):** general-knowledge fallback and per-chat
Documents mode (Auto/Always/Never), edit/regenerate/copy, document
summarise (map-reduce, ACL in SQL), and a two-model stack (Qwen2.5-VL-7B
for chat/vision/routing + bge-m3) with every role's URL set in `.env`.

**Memory layer reworked:** extraction reads only the user's own messages,
runs immediately for self-statements (`memory_saved` event + Forget), always
recalls the user's profile facts, supersedes contradicted facts, retries on
model failure, and a user's facts are private, user-scope and recalled in every
chat and space (team-wide facts also stored project-scope). Interrupted turns
are closed at boot. Old auto-extracted rows are unchanged (offer to purge).

## Decisions
- **Invariant 3 narrowed, by the user's decision (2026-09-25):** a role's URL
  in `.env` may point at a model served elsewhere on the private network. It
  is accepted only on internal hosts (public hosts refused at boot), stored
  `verified=false`, audit-logged, and shown "unverified (external)" in the
  admin UI. Bundled models keep SHA-256 pinning. Reranker is optional; without
  it "no support" comes from embedding similarity (threshold 0.45, untuned).
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
