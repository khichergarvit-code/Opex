# Running OpeX on a new machine

Works the same on Windows, macOS and Linux: **Docker is the only thing you need.** The models,
the document-parsing caches and the demo data are all downloaded/created inside Docker containers.
No Node, pnpm, Python, uv, curl or make required.

## Prerequisites
- Docker with Compose v2 (Docker Desktop on Windows/macOS, Docker Engine on Linux)
- **About 10 GB of memory available to Docker** if you use the bundled CPU model (see "Docker memory" below), and ~4 GB free disk for the models (~7 GB for the `standard` tier, +2 GB for image generation)
- Internet only for the two "setup" commands below; the running stack never uses it

## Setup

```bash
git clone <this repo> && cd opex

cp .env.example .env          # PowerShell: copy .env.example .env
# Edit .env: set POSTGRES_PASSWORD and SESSION_SECRET to real random values
# (the defaults are dev-only placeholders).

docker compose --profile setup build
docker compose --profile setup run --rm model-fetch     # ~3.5 GB of models (small tier): resumable, SHA-256 verified
docker compose --profile setup run --rm docling-warm    # document-parsing models (needed to upload PDFs)

docker compose up -d --build
docker compose exec api node dist/db/seed.js            # demo users + project (safe to run twice)
```

`make setup` runs exactly these commands if you have `make`.

Open **http://localhost:8080** (web). API is at **http://localhost:3000**. The first start takes a minute
or two while the chat model loads; check with `docker compose ps` (wait for `healthy`).

If `model-fetch` is interrupted (network drop, Ctrl+C), run it again: it continues where it stopped.

## Docker memory (bundled CPU model only)
The bundled chat model needs about 6 GB (small tier) or 8 GB (standard) inside Docker, so give Docker about 10 GB.
Not needed when the model runs natively on the GPU. If a model container keeps restarting (`docker compose ps` shows it exiting) it is out of memory.
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

## Which model, and how fast (tiers)

One vision-language model does chat, reading images, routing and tool-calling; bge-m3 does document embeddings.
Pick a tier with `LLM_TIER` in `.env` (default `small`):

| Tier | Model (Apache-2.0) | Size | Fits | Measured on an Apple M4 GPU |
|---|---|---|---|---|
| `small` (default) | Qwen3-VL-4B-Instruct | ~3 GB | any Mac, **NVIDIA 4 GB+ (RTX 3050)** | 33 tokens/s, routing in 0.5 s |
| `standard` | Qwen2.5-VL-7B-Instruct | ~5.5 GB | 16 GB Mac, NVIDIA 8 GB+ | 21 tokens/s, routing in 1.1 s |

Both scored 6/7 on the built-in mini benchmark (`python3 scripts/bench_models.py --model ... --mmproj ...`);
word-problem arithmetic is answered exactly through the code tool rather than by the model's mental maths.
Document parsing (Docling) is a separate CPU service and works with either tier.

## Fast path (recommended): run the model on your GPU

Docker on macOS and Windows can only use the CPU (roughly 2-15 tokens/s under load). Running the same model natively uses
the GPU (Metal on Apple silicon, CUDA on NVIDIA). Measured end to end on the M4 with this stack:
greeting 5.5 s, general question 8 s, document answer 14 s, full document summary 19 s.

**macOS**
```bash
brew install llama.cpp
docker compose --profile setup run --rm model-fetch     # once
./scripts/run-native-llama.sh                           # leave running in its own terminal
```

**Windows (RTX 3050 or any NVIDIA GPU)** in PowerShell:
```powershell
docker compose --profile setup run --rm model-fetch
powershell -ExecutionPolicy Bypass -File scripts\run-native-llama.ps1
```
The script downloads llama.cpp's CUDA build once, reads the GPU's memory, and for a 4 GB card automatically
uses a 4096-token context and a compressed cache so the model fits; 8 GB cards use the normal context. Keep other
GPU-heavy apps closed. (The Windows script has not been run on real hardware by the authors: please report problems.)

Both scripts print the lines to put in `.env`. In short, set:
```
COMPOSE_PROFILES=                          # no bundled CPU model container
LLM_TIER=small                             # or standard
LLM_CTX_LEN=<value the script printed>     # the API trims prompts to this size
LLM_MAIN_URL=http://host.docker.internal:8082
LLM_ROUTER_URL=http://host.docker.internal:8082
LLM_VISION_URL=http://host.docker.internal:8082
```
then `docker compose up -d`. The model then shows as "unverified (external)" in the admin Models page, because the API cannot
hash a file outside Docker. To go back to the bundled CPU model, restore `COMPOSE_PROFILES=docker-llm` and empty the three URLs.

For the `standard` tier with the bundled container also set `LLM_MODEL_FILE=Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf` and
`LLM_MMPROJ_FILE=mmproj-Qwen2.5-VL-7B-Instruct-Q8_0.gguf`, and run `model-fetch` with `LLM_TIER=standard` set.

## Image generation (optional)

"Draw / generate an image of ..." is handled by an image agent using a separate diffusion model, served natively on the GPU
(Metal on Mac, CUDA on Windows) by stable-diffusion.cpp. Model: DreamShaper 8 LCM (Stable Diffusion 1.5 class, 4 steps,
CreativeML OpenRAIL-M licence, ~2.1 GB). Measured on the M4: about 11 s per 512x512 image; ~26 s from request to answer.

```bash
docker compose --profile setup run --rm -e OPEX_FETCH_IMAGE=1 model-fetch   # downloads + verifies the image model once
./scripts/run-native-imagegen.sh                                            # macOS (downloads the ~35 MB server on first run)
# Windows: powershell -ExecutionPolicy Bypass -File scripts\run-native-imagegen.ps1
```
Then set `LLM_IMAGE_URL=http://host.docker.internal:8090` in `.env` and `docker compose up -d api`. Without it the image agent
answers "image generation is not running". On a 4 GB GPU the chat model and the image model cannot both stay in GPU memory:
the Windows script uses `--offload-to-cpu` for cards under 6 GB (slower but works). Generated images are saved as artifacts
and appear inside the chat answer.

## Production: swap models by editing `.env`

Two models run out of the box: the tier's vision-language model (**Qwen3-VL-4B** by default: chat, vision and routing, container `llm-main` or a native GPU server) and **bge-m3** (embeddings, `llm-embed`).

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
