# OpeX

An offline, on-prem agentic AI workbench for confidential industrial
documents. Open-weight models run locally via llama.cpp. Nothing leaves the
room: no runtime egress, no telemetry, no CDN assets.

## Invariants

See `Claude.md` for the full list. The short version: models load only
from `models/` and must match `infra/models/manifest.yaml`'s pinned
SHA-256; ACL/classification filters live inside the retrieval SQL, never as
an after-the-fact filter; every document/tool/web-sourced text block is
untrusted; every LLM/retrieval/tool/policy action writes a span.

## Quickstart

```bash
git clone <this repo> && cd opex
./scripts/fetch-models.sh      # downloads the 4 pinned GGUFs into ./models
make up                        # builds and starts everything, runs migrations automatically
pnpm seed                      # seeds 5 demo users + a default project (run once per fresh DB)
```

Open the app at **http://localhost:8080**. The backend API is at
**http://localhost:3000**.

Seeded users (all share password `opex-dev-password`):

| email | role | clearance |
|---|---|---|
| `admin@opex.local` | super_admin | Restricted |
| `wsadmin@opex.local` | workspace_admin | Confidential |
| `employee.confidential@opex.local` | employee | Confidential |
| `employee.internal@opex.local` | employee | Internal |
| `employee.public@opex.local` | employee | Public |

To stop: `make down`. To verify no container can reach the internet:
`./scripts/verify-offline.sh`.

## What's here

- **A1** (walking skeleton): auth, the model gateway, streaming chat, spans.
- **A2** (documents): ingestion (Docling + OCR), ACL-filtered hybrid
  retrieval, cited doc_qa answers, a document library + page viewer.
- **A3** (routing, timeline, one tool): a router dispatching to 4 agents,
  a citation-check verifier, working memory, a sandboxed `code_exec`/
  `make_chart` tool, an agent timeline UI, read-only admin views.

Full milestone plan: `docs/plan.md`. Current status, decisions, and known
Debt: `docs/PROGRESS.md`. Spec files for each subsystem: `docs/spec/`.

## Demo

Walk through `docs/DEMO.md` for a scripted, offline demo (unplug the
network partway through — that's the point).

## Commands

```
pnpm dev              # apps/api + apps/web in watch mode (needs a reachable Postgres)
pnpm test             # all TS unit/integration tests
pnpm lint             # eslint, all workspaces
pnpm typecheck        # tsc --noEmit, all workspaces
pnpm eval             # runs the eval/ suites against a live API, writes eval/results/<date>.md
make up / make down   # the full docker compose stack
make test             # pnpm test + services/ingest + services/sandbox-runner pytest
./scripts/fetch-models.sh     # download the pinned GGUFs
./scripts/verify-offline.sh   # confirm every container is blocked from the internet
```
