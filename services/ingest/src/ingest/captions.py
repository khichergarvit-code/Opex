"""Figure captioning. llm-main (Qwen2.5-7B-Instruct) is text-only — A1
deferred vision support (no mmproj/vision GGUF in the manifest), so real
image captioning isn't possible yet. Returns a placeholder caption instead
of fabricating a description; A2/A3 don't block on this, and it's called
out as Debt in docs/PROGRESS.md.
"""

from __future__ import annotations


def placeholder_caption(page: int) -> str:
    return f"[Figure on page {page} — captioning unavailable: no vision-capable model is loaded]"
