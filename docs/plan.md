# Delivery plan
Stage A (weeks 1–3) builds a working prototype. Stage B (weeks 4–12) takes the same code to production.
The rule for the prototype is to skip features, not foundations. Log every shortcut under Debt in PROGRESS.md, together with the B milestone that removes it.

## A1 · week 1 · Walking skeleton
Read: core, models, security (Auth, Policy)
Build:
- Monorepo with pnpm and a Python project.
- Compose file with the Stage A services from core.md, and Postgres with pgvector.
- Manifest hash check, hw-probe, and verify-offline.sh.
- Login for seeded users, with roles, clearance, and a basic `can()`.
- The model gateway, conversations, and an SSE chat UI.

Spikes (report each result and its fallback):
- Do the 4 endpoints fit in VRAM?
- Does llm-main handle image input, json_schema output, and `--jinja` tool calls?
- How many CPU seconds per page does Docling take offline?
- Does a filtered HNSW query in pgvector still return k rows?

AC:
- Streaming chat works with a local model.
- Spans and token counts are written to the DB.
- An egress attempt fails from every container.
- Measured VRAM use is recorded.

## A2 · week 2 · Documents
Read: documents, eval (Seed corpus, Suites)
Build the corpus and the retrieval and ACL suites first, and confirm the suites fail. Then build ingestion, retrieval, doc_qa with citations, and the viewer.
AC:
- A question about a table in the scanned manual gets a cited answer.
- The ACL leak count is 0.
- A recall@5 baseline is recorded.

## A3 · week 3 · Routing, timeline, one tool
Read: orchestration (Router, Executor, Verifier), memory (Working), tools (sandbox-runner), ui, eval (Demo)
Build:
- Router and 4 agents.
- Citation check.
- Working memory.
- sandbox-runner with code_exec and make_chart.
- Timeline UI.
- Read-only admin views of traces and usage.
- README and DEMO.md.

AC:
- The prototype demo runs with the network unplugged.
- Every step of the demo takes under 10 s.
- The timeline shows routing between llm-small and llm-main.
- The Debt list is complete.

## Stage B
| Week | Milestone | Read | AC |
|---|---|---|---|
| 4 | B1 Governance + debt | security | Policy matrix tests green; audit tampering detected; an access grant appears and then expires |
| 5–6 | B2 Memory | memory | A preference from chat A is used in chat B; deleting it stops its use; memory from Restricted sources never reaches an Internal user |
| 6–7 | B3 Orchestration | orchestration | Router accuracy ≥ 0.85; verifier catches seeded unsupported claims; parallel multi-step tasks work |
| 8 | B4 Sandbox + tools | tools, models (Gateway) | Escape suite fully contained; an approval survives an API restart |
| 9 | B5 Admin console | ui | Every dashboard runs on real data |
| 10 | B6 Hardening | security, eval | Injection successes = 0; web search is blocked when a task is tainted; no unwaived high or critical dependency findings |
| 11 | B7 Eval + performance | eval | All gates green; p95 latencies published |
| 12 | B8 Release | this file | Every checklist item below is backed by evidence in docs/RELEASE_CHECKLIST.md |

> B1 and B5 were built and merged together as one milestone at the user's
> request (B5's admin console is almost entirely governance-adjacent
> surface — see docs/PROGRESS.md). The table above is left as originally
> planned; this note just records that the two didn't ship in week order.

## B8 release checklist
- The offline bundle installs on a clean machine with no internet.
- A backup and restore drill of Postgres, files, and the manifest has been run, and the restore time recorded.
- Migrations have been tested forward on realistic data, and rollback steps are written.
- A load test with 25 active users and 6 concurrent generations meets the p95 targets.
- Erasure works:
  - Deleting a document removes its chunks, embeddings, page images, derived memories, and artifacts.
  - Deleting a user removes their data according to policy.
  - Both are tested.
- GPU, queue, and disk monitoring is live, with alerts.
- No secrets are baked into images, secret rotation is documented, and TLS is enabled at the edge.
- Runbooks exist for install, upgrade, backup/restore, adding a model, rotating secrets, and incident response.
- verify-offline.sh and audit:verify both pass on the release candidate.