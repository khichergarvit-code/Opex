# Running OpeX on a new machine

## Prerequisites
- Docker + Docker Compose
- Node.js >=22 and pnpm@9.12.0 (only needed for `pnpm seed` / `pnpm eval` / local dev)
- ~6.5GB free disk for model weights
- git

## Setup

```bash
git clone <this repo> && cd opex

cp .env.example .env
# Edit .env: change POSTGRES_PASSWORD and SESSION_SECRET to real random
# values (the .example defaults are dev-only placeholders).

./scripts/fetch-models.sh
# Downloads and SHA-256-verifies 4 GGUF files into ./models/ from
# infra/models/manifest.yaml. This is the one step that needs internet
# access. ~6GB total:
#   qwen2.5-0.5b (469MB, router)  Qwen2.5-7B (4.4GB, main chat)
#   bge-m3 (605MB, embeddings)    bge-reranker-v2-m3 (606MB, rerank)

corepack enable && corepack use pnpm@9.12.0   # or: npm i -g pnpm@9.12.0
pnpm install

make up
# = docker build (sandbox-runner image) + docker compose up -d --build
# Builds and starts Postgres, 4 llama.cpp servers, api, web, ingest,
# docker-socket-proxy, sandbox-runner. Migrations run automatically on
# API boot.

pnpm seed
# Seeds 5 demo users + a default project. Run once per fresh DB only.
```

Open **http://localhost:8080** (web). API is at **http://localhost:3000**.

## Seeded logins

Password for all: `opex-dev-password`

| email | role | clearance |
|---|---|---|
| `admin@opex.local` | super_admin | Restricted |
| `wsadmin@opex.local` | workspace_admin | Confidential |
| `employee.confidential@opex.local` | employee | Confidential |
| `employee.internal@opex.local` | employee | Internal |
| `employee.public@opex.local` | employee | Public |

## Verify offline invariant

```bash
./scripts/verify-offline.sh
```

## Other commands

```bash
make down              # stop the stack
make logs              # follow logs
make test              # pnpm test + services/ingest + services/sandbox-runner pytest
pnpm dev                # apps/api + apps/web in watch mode (needs a reachable Postgres)
pnpm test               # all TS unit/integration tests
pnpm lint               # eslint, all workspaces
pnpm typecheck          # tsc --noEmit, all workspaces
pnpm eval               # runs eval/ suites against a live API, writes eval/results/<date>.md
```

## Notes for hardware other than the original dev box

- Model sizes were picked for a 16GB unified-memory box (see
  `infra/models/manifest.yaml`'s comment). On a machine with a real GPU
  you'd likely want larger models — edit the manifest and re-run
  `fetch-models.sh`.
- Everything is CPU-inference by default (~2-6 tokens/sec measured on the
  original dev box). A machine with an NVIDIA GPU would need CUDA support
  wired into llama.cpp's Docker image/compose config — not currently set up.

## Production: swap models by editing `.env`

Two models run out of the box: **Qwen2.5-VL-7B** (chat, vision and routing, container `llm-main`) and **bge-m3** (embeddings, `llm-embed`). Allocate about 10 GB to Docker.

To use a different or bigger model, install it on any server that speaks the OpenAI-compatible API (llama.cpp `llama-server`, vLLM, ...) and set the role's URL in `.env`, then `docker compose up -d api`:

| Variable | Role |
|---|---|
| `LLM_MAIN_URL` | chat / general answers (also used by document ingestion) |
| `LLM_ROUTER_URL` | decides which agent handles a message |
| `LLM_VISION_URL` | image questions |
| `LLM_EMBED_URL` | document embeddings (changing the embedding model requires re-ingesting documents) |
| `LLM_RERANK_URL` | optional reranker; unset = off |

Example: `LLM_MAIN_URL=http://10.0.0.20:8000`, `LLM_ROUTER_URL=http://10.0.0.20:8000`, `LLM_VISION_URL=http://10.0.0.20:8000`, then stop the bundled `llm-main` to free its memory.

Rules: the host must be internal (Docker service name, `localhost`, `10.x`, `172.16-31.x`, `192.168.x`, `*.local`, `*.internal`); a public address is refused when the API starts, which keeps the no-egress guarantee. An externally served model cannot be SHA-256 verified, so it shows as "unverified (external)" on the admin Models page and its registration is written to the audit log. Bundled models stay hash-pinned in `infra/models/manifest.yaml`.
