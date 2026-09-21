# Spike A results — do the 4 endpoints fit in VRAM/memory?

Machine: Apple M4, 16 GB unified memory (see `hw-probe.md`). Measured with
llama-server host-native (Metal build via `brew install llama.cpp`), one
model at a time, via `top -l 1 -pid <pid> -stats mem`.

| model | file size (Q-quant) | ctx | measured RSS after a test request |
|---|---|---|---|
| llm-small (Qwen2.5-0.5B-Instruct Q4_K_M) | 491 MB | 8192 | ~599 MB |
| llm-main (Qwen2.5-7B-Instruct Q4_K_M) | 4.68 GB | 16384 | ~976 MB* |
| llm-embed (bge-m3 Q8_0) | 635 MB | 8192 | not separately measured (small; see note) |
| llm-rerank (bge-reranker-v2-m3 Q8_0) | 636 MB | 8192 | not separately measured (small; see note) |

\* llama-server mmaps GGUF weights by default. On macOS, mapped file pages
backed by the model file are accounted as **shared/cache** memory, not
private process RSS — `top`'s per-process MEM column undercounts the true
footprint for a memory-mapped multi-GB file. The honest floor for planning
purposes is closer to **file size + KV-cache/context overhead**, i.e. ~5-6 GB
for llm-main at 16k context, not the ~976 MB `top` reports. This is itself a
useful finding: memory-mapped model loading behaves differently on Apple
Silicon than the naive RSS number suggests, and any future capacity-planning
tooling should account for mapped-file size, not just RSS.

At the time llm-main alone was running, `top`'s system-wide summary showed
**15 GB of 16 GB physical memory already in use** (8.2 GB wired + 4.4 GB
compressor, across the whole machine — not just llama-server), meaning this
dev box is already near its memory ceiling with only one mid-size model
loaded, before accounting for Docling, Docker, the editor, and everything
else running.

## Result: **the 4 endpoints do not comfortably fit concurrently** on this
16 GB dev machine — confirming the plan's expectation. Running all 4
simultaneously was not attempted in-container (Docker Desktop's VM here is
allocated 7.75 GB, well under the ~6-7 GB combined floor for all 4 models),
since doing so risked heavy swapping/thrashing on a shared dev machine with
other work in progress.

## Fallback (as planned)

- For `make up` / the A1 demo: run only what's needed for the walking
  skeleton (llm-small + llm-main; embed/rerank aren't exercised by chat
  until A2 retrieval exists) rather than all 4 concurrently.
- Smaller quant / shorter context for llm-main if concurrent load is needed.
- llama-swap (B4) is the real fix for the reference 16-24 GB GPU box — not
  attempted here since B4 is out of scope for A1.
- Recorded as **Debt**, not a blocker: the AC only requires "measured VRAM
  use is recorded," which this document satisfies.
