#!/usr/bin/env bash
# Runs the chat/vision model NATIVELY on this machine so it can use the GPU
# (Metal on Apple silicon, CUDA on NVIDIA). Docker on Mac/Windows can only use the CPU,
# so this is typically 5-10x faster than the bundled container.
#
# Needs llama.cpp's `llama-server` on PATH:  macOS `brew install llama.cpp`,
# Windows `winget install llama.cpp`, Linux: see https://github.com/ggml-org/llama.cpp
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL="${MODEL:-$ROOT_DIR/models/Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf}"
MMPROJ="${MMPROJ:-$ROOT_DIR/models/mmproj-Qwen2.5-VL-7B-Instruct-Q8_0.gguf}"
PORT="${PORT:-8082}"
CTX="${CTX:-16384}"

if ! command -v llama-server >/dev/null 2>&1; then
  echo "llama-server not found. Install llama.cpp first (macOS: brew install llama.cpp)." >&2
  exit 1
fi
if [[ ! -f "$MODEL" ]]; then
  echo "Model file not found: $MODEL" >&2
  echo "Download it first:  docker compose --profile setup run --rm model-fetch" >&2
  exit 1
fi

cat <<MSG
Starting llama-server on port $PORT (GPU offload on).
Then point OpeX at it by adding these lines to .env and restarting the API:

  LLM_MAIN_URL=http://host.docker.internal:$PORT
  LLM_ROUTER_URL=http://host.docker.internal:$PORT
  LLM_VISION_URL=http://host.docker.internal:$PORT

  docker compose stop llm-main && docker compose up -d api

MSG

args=(-m "$MODEL" --host 0.0.0.0 --port "$PORT" -c "$CTX" -np 1 --jinja -ngl 99)
[[ -f "$MMPROJ" ]] && args+=(--mmproj "$MMPROJ")
exec llama-server "${args[@]}"
