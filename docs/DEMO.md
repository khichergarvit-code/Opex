# Prototype demo (A3)

Matches eval.md's Demo script. Run each step for real — this is a
walkthrough, not a description.

## 0. Setup

```bash
./scripts/fetch-models.sh
make up
pnpm seed
```

Upload the eval corpus into the default project so there's something to
ask about (or use the eval harness's fixture uploader):

```bash
pnpm eval   # uploads eval/corpus/, waits for ingestion, runs the suites
```

(Or upload manually via the Documents page — pump-manual.pdf,
scanned-inspection-report.pdf, downtime.csv, and the rest are in
`eval/corpus/`.)

## 1. Verify offline, then actually go offline

```bash
./scripts/verify-offline.sh
```

Confirm it prints `verify-offline: PASS` and `8/8 containers blocked all
egress` (or however many services are running). **Now physically
disconnect the network** — turn off Wi-Fi or unplug ethernet. Everything
below runs with no internet connection.

## 2. A cited answer from a scanned document

Log in as `employee.internal@opex.local` (password `opex-dev-password`).
Ask: **"What's the torque spec for the discharge flange bolts?"**

Expect: a cited answer (`460 Nm [n]`), citation chip(s) inline. Click a
citation — the viewer opens the pump manual at the right page with the
source region highlighted.

## 3. Sandbox chart from an uploaded CSV

In the same conversation (or a new one), with the downtime CSV already
uploaded: ask **"Show me a Pareto chart of downtime causes."** Open the
timeline (the "Show timeline" button) — you should see a `route` event
(`analysis` agent), a `tool_call`/`tool_result` pair for `make_chart`, and
the chart PNG in the Artifacts panel.

## 4. Nothing leaks to an uncleared user

Still as `employee.internal@opex.local` (clearance 1, Internal — below
Restricted), ask about the restricted design document: **"What is Project
Kestrel-9?"** Expect a "no support" style answer — the codename `Kestrel-9`
must never appear in the response. (`pnpm eval`'s `acl-leak` suite checks
this automatically across all three non-Restricted seeded users; leak
count must be 0.)

## 5. Routing shown on the timeline

Start a fresh conversation. Send a plain greeting first (**"hi"**), then a
document question (**"What's the bearing relube interval?"**) in the same
conversation. Open the timeline: both turns show a `route` event — the
**router** (llm-small) classifies every turn, visible as the `route`
event's presence on both. The greeting routes to the `general` agent; the
document question routes to `doc_qa`. Both agents currently answer on
llm-main (all 4 agents map to the `general` model role for now — see
docs/PROGRESS.md's Decisions) — the routing distinction that's visible is
*which agent* handles each turn, not which model generates the final
answer.

## Timing

**Not currently met on CPU-only dev hardware.** A real, warm doc_qa turn
(retrieval + rerank + answer synthesis on llm-main, a 7B Q4_K_M model with
no GPU) measured **71 seconds** end to end — see `docs/PROGRESS.md`'s Debt
list. The plain-chat and router paths (llm-small, 0.5B) are fast; the
slow step is always llm-main's answer generation. A3's own executor.ts
already documented this same finding for the tool-call loop (its wall-clock
deadline is 90s, not 10s, for the same reason). Getting under 10s needs
either a GPU or a smaller/faster answer model — both Stage B hardware
decisions (see the plan's Open Questions), not a code fix available in A3.
