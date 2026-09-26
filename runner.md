# Running OpeX on a new machine

Works the same on Windows, macOS and Linux: **Docker is the only thing you need.** The models,
the document-parsing caches and the demo data are all downloaded/created inside Docker containers.
No Node, pnpm, Python, uv, curl or make required.

## Prerequisites
- Docker with Compose v2 (Docker Desktop on Windows/macOS, Docker Engine on Linux)
- A GPU is strongly recommended (Apple silicon, or NVIDIA with 4 GB+ VRAM; AMD/Intel via Vulkan on Linux). Without one, the model runs on the CPU inside Docker (slow, needs ~10 GB Docker memory).
- Disk: ~3.6 GB for the default `small` tier (see "What gets downloaded"). Internet only for the setup commands; the running stack never uses it.

## Setup (all systems)

```bash
git clone <this repo> && cd opex

cp .env.example .env          # PowerShell: copy .env.example .env
# Edit .env: set POSTGRES_PASSWORD and SESSION_SECRET to real random values
# (the defaults are dev-only placeholders).

docker compose --profile setup build
docker compose --profile setup run --rm model-fetch     # only the files for your tier: resumable, SHA-256 verified
docker compose --profile setup run --rm docling-warm    # document-parsing models (needed to upload PDFs)
```

Then start the chat model for your system (next section), and finally:

```bash
docker compose up -d --build
docker compose exec api node dist/db/seed.js            # demo users + project (safe to run twice)
```

`make setup` runs the same commands if you have `make`. Open **http://localhost:8080** (web); the API is at **http://localhost:3000**.
Check with `docker compose ps` (wait for `healthy`). If `model-fetch` is interrupted, run it again: it continues where it stopped.

### What gets downloaded (and what does not)
| File | Size | Downloaded when |
|---|---|---|
| Qwen3-VL-4B Q4 + its vision projector | 2.5 + 0.45 GB | always (tier `small`, default) |
| bge-m3 embeddings | 0.63 GB | always |
| Qwen2.5-VL-7B Q4 + projector | 4.7 + 0.85 GB | only with `LLM_TIER=standard` |
| DreamShaper 8 LCM (image generation) | 2.1 GB | only with `-e OPEX_FETCH_IMAGE=1` |
| Reranker | 0.9 GB | never by default (off) |

Files of a tier you did not choose are never downloaded; `model-fetch` prints the list it needs.

## Run the chat model on your GPU (before `docker compose up`)

Docker on macOS and Windows cannot use the GPU, so the model runs natively on the host and the containers reach it through
`host.docker.internal`. The scripts listen on `127.0.0.1` (Linux: the Docker bridge address) only, never on your LAN.
Pass `--write-env` (PowerShell: `-WriteEnv`) and the script sets `COMPOSE_PROFILES`, `LLM_TIER`, `LLM_CTX_LEN` and the three `LLM_*_URL`
lines in `.env` for you. Leave the script running in its own terminal.

**macOS (Apple silicon, Metal)**
```bash
brew install llama.cpp
./scripts/run-native-llama.sh --write-env
```

**Windows (NVIDIA, CUDA)** in PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\run-native-llama.ps1 -WriteEnv
```
It downloads llama.cpp's CUDA build once, reads the GPU memory, and for a 4 GB card uses a 4096-token context and a compressed
cache so the model fits (8 GB+ cards use the normal context). Close other GPU-heavy apps.
(Not run on real Windows hardware by the authors: please report problems.)

**Linux, NVIDIA or AMD, model on the host**
Install a llama.cpp build for your GPU (release zips at github.com/ggml-org/llama.cpp: `cuda` for NVIDIA, `vulkan` for AMD/Intel; or `brew install llama.cpp`), put `llama-server` on your PATH, then:
```bash
./scripts/run-native-llama.sh --write-env
```
**Linux, NVIDIA, model in a container** (needs the NVIDIA Container Toolkit; no host install):
```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml --profile docker-gpu up -d
```
(leave `COMPOSE_PROFILES` and the `LLM_*_URL` lines in `.env` empty.)

**No GPU (CPU only, slow)**: keep `COMPOSE_PROFILES=docker-llm` in `.env` (the default) and give Docker ~10 GB of memory (below).

`--write-env` and the container option are alternatives to each other; use one. The native model shows as "unverified (external)" in the admin Models page
because the API cannot hash a file outside Docker. To go back to the CPU container, set `COMPOSE_PROFILES=docker-llm` and empty the three URLs.

### Check it is really on the GPU
```bash
curl http://localhost:8082/health          # {"status":"ok"} (Linux: use the bridge address the script printed)
nvidia-smi                                 # NVIDIA: llama-server is listed with ~3-4 GB used
sudo powermetrics --samplers gpu_power -n 1   # macOS: GPU active residency rises while it answers
```
Measured on an Apple M4 GPU: greeting 5.5 s, general question 8 s, document answer 14 s. On the CPU expect 2-15 tokens/s.

## Docker memory (CPU model only)
Only needed for the bundled CPU model (about 6 GB small / 8 GB standard, so give Docker ~10 GB). Not needed when the model runs on the GPU.
If a model container keeps restarting (`docker compose ps` shows it exiting) it is out of memory.
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

## Image generation (optional)

"Draw / generate an image of ..." is handled by an image agent using a separate diffusion model, served natively on the GPU
(Metal on Mac, CUDA on Windows) by stable-diffusion.cpp. Model: DreamShaper 8 LCM (Stable Diffusion 1.5 class, 4 steps,
CreativeML OpenRAIL-M licence, ~2.1 GB). Measured on the M4: about 11 s per 512x512 image; ~26 s from request to answer.

```bash
docker compose --profile setup run --rm -e OPEX_FETCH_IMAGE=1 model-fetch   # downloads + verifies the image model once
./scripts/run-native-imagegen.sh                                            # macOS (downloads the ~35 MB server on first run)
# Windows: powershell -ExecutionPolicy Bypass -File scripts\run-native-imagegen.ps1
```
Then set `LLM_IMAGE_URL=http://host.docker.internal:8090` in `.env` (it also listens on `127.0.0.1` only) and `docker compose up -d api`. Without it the image agent
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
