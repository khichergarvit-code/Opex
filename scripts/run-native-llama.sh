#!/usr/bin/env bash
# Runs the chat/vision model NATIVELY on this machine so it uses the GPU (Metal on Apple silicon,
# CUDA on NVIDIA). Docker on macOS/Windows can only use the CPU, so this is many times faster.
#
#   ./scripts/run-native-llama.sh            # tier from LLM_TIER (default: small)
#   LLM_TIER=standard ./scripts/run-native-llama.sh
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

cat <<MSG
Starting the '$TIER' model on port $PORT with GPU offload.
Add these lines to .env, then restart the API:

  LLM_TIER=$TIER
  LLM_CTX_LEN=$CTX
  LLM_MAIN_URL=http://host.docker.internal:$PORT
  LLM_ROUTER_URL=http://host.docker.internal:$PORT
  LLM_VISION_URL=http://host.docker.internal:$PORT

  docker compose stop llm-main && docker compose up -d api

MSG

args=(-m "$MODEL" --host 0.0.0.0 --port "$PORT" -c "$CTX" -np 1 --jinja -ngl 99 ${KV_ARGS[@]+"${KV_ARGS[@]}"})
[[ -f "$MMPROJ" ]] && args+=(--mmproj "$MMPROJ")
exec llama-server "${args[@]}"
