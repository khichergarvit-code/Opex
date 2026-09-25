#!/usr/bin/env bash
# Downloads the GGUF files referenced by infra/models/manifest.yaml from
# Hugging Face into ./models. This is the one place a fresh checkout needs
# internet access — it's a host-side setup step, not runtime egress from a
# `core` container (invariant #1 is about the internal Docker networks at
# runtime). Verifies each downloaded file's SHA-256 against the manifest's
# pinned value and refuses to leave a mismatched file in place.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODELS_DIR="${MODELS_DIR:-$ROOT_DIR/models}"
mkdir -p "$MODELS_DIR"

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

if ! command -v node >/dev/null 2>&1 || [[ ! -d "$ROOT_DIR/node_modules/js-yaml" ]]; then
  echo "This host-side script needs Node.js and 'pnpm install' first." >&2
  echo "Easier and OS-independent: docker compose --profile setup run --rm model-fetch (see RUNNER.md)." >&2
  exit 1
fi

MANIFEST_TSV=$(node "$ROOT_DIR/scripts/list-manifest-models.mjs")

if [[ -z "$MANIFEST_TSV" ]]; then
  echo "No enabled entries found in infra/models/manifest.yaml" >&2
  exit 1
fi

while IFS=$'\t' read -r id gguf_path source_url expected_sha; do
  if [[ -z "$source_url" ]]; then
    echo "[$id] has no source_url in the manifest — skipping (add one to fetch it automatically)." >&2
    continue
  fi

  dest="$MODELS_DIR/$gguf_path"

  if [[ -f "$dest" ]]; then
    echo "[$id] already present at $dest"
  else
    echo "[$id] downloading from $source_url ..."
    # -C - resumes a partial .part file; retries cover flaky connections.
    curl -SL --fail --retry 10 --retry-delay 5 --retry-all-errors -C - -o "$dest.part" "$source_url"
    mv "$dest.part" "$dest"
  fi

  actual_sha=$(sha256_of "$dest")
  echo "[$id] sha256: $actual_sha"

  if [[ -n "$expected_sha" && "$expected_sha" != "$actual_sha" ]]; then
    echo "[$id] SHA-256 MISMATCH: manifest says $expected_sha, file is $actual_sha" >&2
    echo "Refusing to continue — see invariant #3 (models must match the manifest)." >&2
    exit 1
  fi
done <<< "$MANIFEST_TSV"

echo
echo "All models downloaded to $MODELS_DIR."
echo "Run 'pnpm manifest:check' to verify everything against infra/models/manifest.yaml."

# Docling's own layout/table-structure models aren't GGUFs and aren't in
# the manifest — it downloads them from HF lazily on first use. The ingest
# container runs with HF_HUB_OFFLINE=1 (invariant #1/#2), so that cache
# must be pre-populated here, on the host, where network access is fine,
# and mounted into the container (see docker-compose.yml's ingest service).
DOCLING_CACHE_DIR="$MODELS_DIR/docling-cache"
if [[ -d "$DOCLING_CACHE_DIR/hub" ]] && find "$DOCLING_CACHE_DIR/hub" -maxdepth 1 -iname "*docling*" | grep -q .; then
  echo "[docling] model cache already present at $DOCLING_CACHE_DIR"
else
  echo "[docling] warming the layout/table-structure model cache (one-time, needs network)..."
  mkdir -p "$DOCLING_CACHE_DIR"
  if [[ -x "$ROOT_DIR/services/ingest/.venv/bin/python" ]]; then
    PY="$ROOT_DIR/services/ingest/.venv/bin/python"
  elif command -v uv >/dev/null 2>&1; then
    (cd "$ROOT_DIR/services/ingest" && uv sync >/dev/null)
    PY="$ROOT_DIR/services/ingest/.venv/bin/python"
  else
    echo "[docling] neither services/ingest/.venv nor uv is available — skipping cache warm-up." >&2
    echo "[docling] run 'cd services/ingest && uv sync' then re-run this script." >&2
    PY=""
  fi
  if [[ -n "$PY" ]]; then
    HF_HOME="$DOCLING_CACHE_DIR" "$PY" -c "
from docling.document_converter import DocumentConverter
DocumentConverter()  # triggers Docling's lazy model download
print('[docling] model cache warmed at $DOCLING_CACHE_DIR')
"
  fi
fi
