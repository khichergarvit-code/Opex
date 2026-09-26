# Progress

## Status
A1–A3, B1+B5 and B2–B4 (memory, orchestration, sandbox) are done; evidence in `docs/archive/`.

**Chat + models (this pass):** general-knowledge fallback and per-chat
Documents mode (Auto/Always/Never), edit/regenerate/copy, document
summarise (map-reduce, ACL in SQL), and a two-model stack (one VLM for
chat/vision/routing + bge-m3) with every role's URL set in `.env`.

**Memory layer reworked:** extraction reads only the user's own messages,
runs immediately for self-statements (`memory_saved` event + Forget), always
recalls the user's profile facts, supersedes contradicted facts, retries on
model failure, and a user's facts are private, user-scope and recalled in every
chat and space (team-wide facts also stored project-scope). Interrupted turns
are closed at boot. Old auto-extracted rows are unchanged (offer to purge).

**M1 (speed/Stop/context) done:** Stop now cancels every phase (signal through
routing, memory, fold; `POST /conversations/:id/stop`; ended a live run in 1 s);
plain chat skips the router call (2 ms vs seconds); one revision instead of two;
memory learning never delays `done` (waits ≤3 s); prompts are trimmed to the
model window (`models/contextFit.ts`); answers show time-to-first-word and
tok/s; one 16k slot (`-np 1`); `scripts/run-native-llama.sh` for GPU speed.

**Demo pass:** native-GPU path (Qwen3-VL-4B default, 33 tok/s on M4; measured greeting 5.5 s,
document answer 14 s, summary 19 s), tiers `small`/`standard`, `COMPOSE_PROFILES=docker-llm`
switch, image generation (`image` role/agent/`generate_image`, DreamShaper 8 LCM, ~11 s/image),
unused models + build cache removed (~18 GB). Bug list `bugs-runner.md`: unlike toggle,
traces filter, feedback text, sortable tables, models toggle/order, memory admin TTL,
history search/delete/clear, dates, emoji/dashed boxes fixed; more UI items open.

## Decisions
- **Invariant 3 narrowed, by the user's decision (2026-09-25):** a role's URL
  in `.env` may point at a model served elsewhere on the private network. It
  is accepted only on internal hosts (public hosts refused at boot), stored
  `verified=false`, audit-logged, and shown "unverified (external)" in the
  admin UI. Bundled models keep SHA-256 pinning. Reranker is optional; without
  it "no support" comes from embedding similarity (threshold 0.45, untuned).
- Memory: every injected memory goes in a labeled user-turn block, never
  the system prompt (invariant #5); extraction/purge is an in-process interval.
- B3/B4 decisions: see `docs/archive/b2-b4.md`.

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
