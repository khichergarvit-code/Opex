#!/usr/bin/env bash
# Runs the chat/vision model NATIVELY on this machine so it uses the GPU (Metal on Apple silicon,
# CUDA on NVIDIA). Docker on macOS/Windows can only use the CPU, so this is many times faster.
#
#   ./scripts/run-native-llama.sh            # tier from LLM_TIER (default: small)
#   LLM_TIER=standard ./scripts/run-native-llama.sh
#   ./scripts/run-native-llama.sh --write-env   # also point .env at this server (idempotent), then start it
#
# The server listens on 127.0.0.1 (macOS) or the Docker bridge address (Linux) only, never on the LAN.
# HOST=0.0.0.0 overrides that (the model API has no login: only do it on a trusted network).
#
# Tiers (same GGUF format everywhere; pick by GPU memory):
#   small     Qwen3-VL-4B  ~3 GB   fits 4 GB GPUs (e.g. RTX 3050 laptop) and any Mac
#   standard  Qwen2.5-VL-7B ~5.5 GB  needs an 8 GB+ GPU or a Mac with 16 GB
#
# Needs llama.cpp's `llama-server` on PATH: macOS `brew install llama.cpp`,
# Windows `winget install llama.cpp` (or scripts/run-native-llama.ps1), Linux: see llama.cpp releases.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIER="${LLM_TIER:-small}"
case "$TIER" in
  small)    DEF_MODEL="Qwen3VL-4B-Instruct-Q4_K_M.gguf";   DEF_MMPROJ="mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf";   DEF_CTX=8192 ;;
  standard) DEF_MODEL="Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf"; DEF_MMPROJ="mmproj-Qwen2.5-VL-7B-Instruct-Q8_0.gguf"; DEF_CTX=16384 ;;
  *) echo "LLM_TIER must be small or standard" >&2; exit 1 ;;
esac
MODEL="${MODEL:-$ROOT_DIR/models/$DEF_MODEL}"
MMPROJ="${MMPROJ:-$ROOT_DIR/models/$DEF_MMPROJ}"
PORT="${PORT:-8082}"
WRITE_ENV=0
[[ "${1:-}" == "--write-env" ]] && WRITE_ENV=1

# Bind address: the Docker containers reach a host service through host.docker.internal. On Docker Desktop
# (macOS) loopback is enough; on Linux the containers arrive from the bridge network, so bind that address.
if [[ -z "${HOST:-}" ]]; then
  if [[ "$(uname -s)" == "Darwin" ]]; then
    HOST="127.0.0.1"
  else
    HOST="$(docker network inspect bridge --format '{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null || true)"
    HOST="${HOST:-172.17.0.1}"
  fi
fi
[[ "$HOST" == "0.0.0.0" ]] && echo "WARNING: HOST=0.0.0.0 exposes the model to your whole network (no login)." >&2

# Context size and KV-cache precision follow the GPU memory: a 4 GB card (e.g. RTX 3050 laptop) cannot
# hold the model plus a large context, so it gets a smaller, quantized cache.
KV_ARGS=()
if [[ "$(uname -s)" == "Darwin" ]]; then
  CTX="${CTX:-16384}"                      # unified memory: plenty of room
elif command -v nvidia-smi >/dev/null 2>&1; then
  VRAM_MB="$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1 | tr -d ' ')"
  if (( VRAM_MB < 5500 )); then
    CTX="${CTX:-4096}"; KV_ARGS=(-fa on --cache-type-k q8_0 --cache-type-v q8_0)
  else
    CTX="${CTX:-$DEF_CTX}"
  fi
  echo "Detected NVIDIA GPU with ${VRAM_MB} MB."
else
  CTX="${CTX:-$DEF_CTX}"
fi

if ! command -v llama-server >/dev/null 2>&1; then
  echo "llama-server not found. Install llama.cpp first (macOS: brew install llama.cpp)." >&2
  exit 1
fi
if [[ ! -f "$MODEL" ]]; then
  echo "Model file not found: $MODEL" >&2
  echo "Download it first:  docker compose --profile setup run --rm model-fetch   (LLM_TIER=$TIER)" >&2
  exit 1
fi

if (( WRITE_ENV )); then
  ENV_FILE="$ROOT_DIR/.env"
  [[ -f "$ENV_FILE" ]] || cp "$ROOT_DIR/.env.example" "$ENV_FILE"
  set_env() { # set_env KEY VALUE: replace the line if present, else append
    if grep -qE "^$1=" "$ENV_FILE"; then
      sed -i.bak -E "s|^$1=.*|$1=$2|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
    else
      printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE"
    fi
  }
  set_env COMPOSE_PROFILES ""
  set_env LLM_TIER "$TIER"
  set_env LLM_CTX_LEN "$CTX"
  for role in MAIN ROUTER VISION; do set_env "LLM_${role}_URL" "http://host.docker.internal:$PORT"; done
  echo ".env updated. Apply with:  docker compose up -d"
fi

cat <<MSG
Starting the '$TIER' model on port $PORT with GPU offload (listening on $HOST).
Add these lines to .env (or rerun with --write-env), then restart the API:

  LLM_TIER=$TIER
  LLM_CTX_LEN=$CTX
  LLM_MAIN_URL=http://host.docker.internal:$PORT
  LLM_ROUTER_URL=http://host.docker.internal:$PORT
  LLM_VISION_URL=http://host.docker.internal:$PORT

  docker compose stop llm-main && docker compose up -d api

MSG

args=(-m "$MODEL" --host "$HOST" --port "$PORT" -c "$CTX" -np 1 --jinja -ngl 99 ${KV_ARGS[@]+"${KV_ARGS[@]}"})
[[ -f "$MMPROJ" ]] && args+=(--mmproj "$MMPROJ")
exec llama-server "${args[@]}"
