"""Spike C: how many CPU seconds per page does Docling take offline?

Standalone — not wired into services/ingest (that's A2). Run against 1-2
sample PDFs and report seconds/page, so a real ingest pipeline's throughput
can be sized in A2.

Usage:
    uv run --with docling python scripts/spikes/docling-throughput.py <path-to-pdf> [more.pdf ...]

(Or, inside services/ingest's environment: `uv sync --extra dev && uv run
python ../../scripts/spikes/docling-throughput.py <pdf>`.)
"""

from __future__ import annotations

import sys
import time
from pathlib import Path


def main(argv: list[str]) -> int:
    if not argv:
        print("Usage: docling-throughput.py <path-to-pdf> [more.pdf ...]", file=sys.stderr)
        return 1

    try:
        from docling.document_converter import DocumentConverter
    except ImportError:
        print(
            "docling is not installed in this environment. "
            "Run via: cd services/ingest && uv sync --extra dev && "
            "uv run python ../../scripts/spikes/docling-throughput.py <pdf>",
            file=sys.stderr,
        )
        return 1

    converter = DocumentConverter()
    results = []

    for pdf_path in argv:
        path = Path(pdf_path)
        if not path.exists():
            print(f"skip: {path} does not exist", file=sys.stderr)
            continue

        started = time.process_time()
        wall_started = time.monotonic()
        doc = converter.convert(str(path)).document
        cpu_seconds = time.process_time() - started
        wall_seconds = time.monotonic() - wall_started

        num_pages = len(doc.pages) if hasattr(doc, "pages") else 1
        per_page = cpu_seconds / max(num_pages, 1)
        results.append((path.name, num_pages, cpu_seconds, wall_seconds, per_page))
        print(
            f"{path.name}: {num_pages} page(s), "
            f"{cpu_seconds:.2f} CPU-s total ({wall_seconds:.2f} wall-s), "
            f"{per_page:.2f} CPU-s/page"
        )

    if results:
        avg = sum(r[4] for r in results) / len(results)
        print(f"\nAverage: {avg:.2f} CPU-s/page across {len(results)} document(s)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
