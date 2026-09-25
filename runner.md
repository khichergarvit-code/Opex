# Running OpeX on a new machine

Works the same on Windows, macOS and Linux: **Docker is the only thing you need.** The models,
the document-parsing caches and the demo data are all downloaded/created inside Docker containers.
No Node, pnpm, Python, uv, curl or make required.

## Prerequisites
- Docker with Compose v2 (Docker Desktop on Windows/macOS, Docker Engine on Linux)
- **About 10 GB of memory available to Docker** (see "Docker memory" below) and ~7 GB free disk for the models
- Internet only for the two "setup" commands below; the running stack never uses it

## Setup

```bash
git clone <this repo> && cd opex

cp .env.example .env          # PowerShell: copy .env.example .env
# Edit .env: set POSTGRES_PASSWORD and SESSION_SECRET to real random values
# (the defaults are dev-only placeholders).

docker compose --profile setup build
docker compose --profile setup run --rm model-fetch     # ~6 GB of models: resumable, SHA-256 verified
docker compose --profile setup run --rm docling-warm    # document-parsing models (needed to upload PDFs)

docker compose up -d --build
docker compose exec api node dist/db/seed.js            # demo users + project (safe to run twice)
```

`make setup` runs exactly these commands if you have `make`.

Open **http://localhost:8080** (web). API is at **http://localhost:3000**. The first start takes a minute
or two while the chat model loads; check with `docker compose ps` (wait for `healthy`).

If `model-fetch` is interrupted (network drop, Ctrl+C), run it again: it continues where it stopped.

## Docker memory
The chat model (Qwen2.5-VL-7B, also used for images and routing) needs about 8 GB by itself, so give Docker about
10 GB. If a model container keeps restarting (`docker compose ps` shows it exiting) it is out of memory.
- **Docker Desktop (Windows/macOS):** Settings > Resources > Memory.
- **Windows with WSL2 backend:** create `%UserProfile%\.wslconfig` containing `[wsl2]` and `memory=10GB`, then run `wsl --shutdown` and restart Docker Desktop.
- **Linux:** Docker uses the machine's memory; nothing to set.

## Seeded logins

Password for all: `opex-dev-password`

| email | role | clearance |
|---|---|---|
| `admin@opex.local` | super_admin | Restricted |
| `wsadmin@opex.local` | workspace_admin | Confidential |
| `employee.confidential@opex.local` | employee | Confidential |
| `employee.internal@opex.local` | employee | Internal |
| `employee.public@opex.local` | employee | Public |

## Troubleshooting

| Symptom | Fix |
|---|---|
| API exits with "Model file missing … model-fetch" | Run `docker compose --profile setup run --rm model-fetch`, then `docker compose up -d`. |
| `model-fetch` says "SHA-256 mismatch" | The file is removed automatically; run it again. If it repeats, the download source changed: do not bypass the check. |
| Chat says "The answer model isn't reachable" or a `llm-*` container keeps restarting | Out of memory: raise Docker's memory (above). Remove old containers from earlier versions: `docker compose rm -sf llm-vision llm-small llm-rerank`. |
| Uploading a PDF fails | The document-parsing cache is missing: run `docker compose --profile setup run --rm docling-warm`, then `docker compose restart ingest`. |
| "port is already allocated" (8080 or 3000) | Stop whatever uses the port, or change the published port in `docker-compose.yml`. |
| Start over from a clean database | `docker compose down -v` (deletes stored data, keeps the downloaded models), then repeat from `docker compose up -d --build`. |

## Verify offline invariant

```bash
./scripts/verify-offline.sh     # bash (Git Bash/WSL on Windows)
```

## Other commands

```bash
docker compose down      # stop the stack (make down)
docker compose logs -f   # follow logs (make logs)
```

Developer commands (need Node >= 22 and `corepack enable && corepack use pnpm@9.12.0`, then `pnpm install`):
`pnpm dev`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm seed`, `pnpm eval`, `pnpm manifest:check`, `make test`.
`./scripts/fetch-models.sh` is the host-side alternative to `model-fetch` (needs `pnpm install` first).

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
