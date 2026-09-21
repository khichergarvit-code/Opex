# Spike C results — Docling CPU-seconds/page

Run via `uv run python scripts/spikes/docling-throughput.py <pdf>` inside
`services/ingest`'s uv environment (docling + RapidOCR, CPU backend on this
Mac — no GPU acceleration path was configured for Docling itself).

Test document: IRS Form 1040 (public-domain, 2 pages, mixed text + tables —
no representative industrial manual page was supplied for this run; see the
plan's Open Question #22).

## Result

```
f1040.pdf: 2 page(s), 78.63 CPU-s total (118.96 wall-s), 39.32 CPU-s/page
```

**~39.3 CPU-seconds/page** on this machine's CPU backend (Apple M4, no GPU
acceleration configured for Docling/RapidOCR). Wall time exceeded CPU time
(118.96s wall vs. 78.63s CPU), suggesting some I/O/model-loading overhead
not amortized across more pages — a longer document would likely show a
lower per-page average once RapidOCR's models are warm.

## Implication for A2

At ~40 CPU-s/page, ingesting even a modest 50-page manual would take ~33
CPU-minutes single-threaded. This is workable for a background `ingest`
worker (matches core.md's "Python worker that polls `jobs`" design — it's
meant to be async, not on the request path), but throughput should be
revisited in A2 once real corpus sizes are known, and parallelizing across
CPU cores (or evaluating a lighter OCR backend) may be worth it if the A2
corpus is large.

## Fallback

Not needed — Docling completed successfully offline (models were already
cached from a prior warm-up run; first-run also requires a one-time,
host-side download of RapidOCR's small OCR models, consistent with
`fetch-models.sh`'s "one-time host setup, not runtime egress" pattern). No
need to evaluate alternatives (PyMuPDF + Tesseract) at this time.
