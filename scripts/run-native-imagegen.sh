#!/usr/bin/env bash
# Starts the image-generation server NATIVELY on this machine (GPU: Metal on Apple silicon).
# It is stable-diffusion.cpp's `sd-server` with a 4-step (LCM) model, so a picture takes a few seconds.
#
#   docker compose --profile setup run --rm -e OPEX_FETCH_IMAGE=1 model-fetch   # downloads the model once (~2.1 GB)
#   ./scripts/run-native-imagegen.sh
#
# Then add  LLM_IMAGE_URL=http://host.docker.internal:8090  to .env and restart the API.
# Windows: scripts/run-native-imagegen.ps1.  Linux: put a `sd-server` build (Vulkan/CUDA) on PATH.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL="${IMAGE_MODEL:-$ROOT_DIR/models/DreamShaper8_LCM.safetensors}"
PORT="${IMAGE_PORT:-8090}"
TOOLS="$ROOT_DIR/tools/sd"

if [[ ! -f "$MODEL" ]]; then
  echo "Image model not found: $MODEL" >&2
  echo "Download it:  docker compose --profile setup run --rm -e OPEX_FETCH_IMAGE=1 model-fetch" >&2
  exit 1
fi

SD="$(command -v sd-server || true)"
[[ -z "$SD" && -x "$TOOLS/sd-server" ]] && SD="$TOOLS/sd-server"
if [[ -z "$SD" ]]; then
  if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
    echo "sd-server not found. Get a build for your platform from https://github.com/leejet/stable-diffusion.cpp/releases and put it on PATH." >&2
    exit 1
  fi
  echo "Downloading stable-diffusion.cpp (macOS arm64, ~35 MB) ..."
  mkdir -p "$TOOLS"
  URL="$(curl -fsSL https://api.github.com/repos/leejet/stable-diffusion.cpp/releases/latest | python3 -c "import sys,json;print(next(a['browser_download_url'] for a in json.load(sys.stdin)['assets'] if 'Darwin' in a['name'] and 'arm64' in a['name']))")"
  curl -fsSL -o "$TOOLS/sd.zip" "$URL"
  (cd "$TOOLS" && unzip -oq sd.zip && rm sd.zip)
  SD="$TOOLS/sd-server"
fi

cat <<MSG
Starting the image server on port $PORT.
Add this line to .env, then restart the API:   LLM_IMAGE_URL=http://host.docker.internal:$PORT
MSG
exec "$SD" -m "$MODEL" --listen-ip "${HOST:-127.0.0.1}" --listen-port "$PORT" --steps 4 --cfg-scale 1.5 --sampling-method lcm --diffusion-fa
