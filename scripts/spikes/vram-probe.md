# Spike A — do the 4 endpoints fit in VRAM/memory?

Runs llama-server host-native (Metal-accelerated on this Mac) for each model
in `infra/models/manifest.yaml` and measures peak resident memory, since
Docker Desktop on Mac doesn't pass Metal through to Linux containers (real
numbers require running outside Docker here — see docker-compose.yml's
comment for the in-container CPU-only path used by `make up`).

## Prerequisites

- `./scripts/fetch-models.sh` has downloaded the 4 GGUF files into `models/`.
- A native llama-server binary with Metal support, e.g. `brew install llama.cpp`.

## Procedure

For each model, start it alone and record peak RSS with `/usr/bin/time -l`:

```bash
/usr/bin/time -l llama-server -m models/qwen2.5-0.5b-instruct-q4_k_m.gguf \
  --host 127.0.0.1 --port 8081 -c 8192 --jinja &
# ... issue a test request, then Ctrl-C and read "maximum resident set size" from the time output
```

Repeat for `Qwen2.5-7B-Instruct-Q4_K_M.gguf` (port 8082), `bge-m3-Q8_0.gguf`
(port 8083, `--embedding`), and `bge-reranker-v2-m3-Q8_0.gguf` (port 8084,
`--reranking`). Then start all 4 simultaneously and record combined peak RSS
plus whether the OS starts swapping (`vm_stat` on macOS).

## Result

See `scripts/spikes/results/vram-probe.md` for the numbers from this run.
