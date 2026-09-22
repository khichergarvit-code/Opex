"""Layout-aware chunker: 400-600 token band, ~15% overlap, tables always
their own chunk (split with a repeated header row if oversized), figures
get a caption chunk. Token counts are a fast word-count heuristic
(word_count * 1.3), not exact BPE — fine for a target band, not for an
exact budget (real budgets use /tokenize elsewhere).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from .docling_parse import Block

MIN_TOKENS = 400
MAX_TOKENS = 600
OVERLAP_FRACTION = 0.15

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


def estimate_tokens(text: str) -> int:
    words = text.split()
    return max(1, round(len(words) * 1.3))


def _split_sentences(text: str) -> list[str]:
    parts = _SENTENCE_SPLIT_RE.split(text.strip())
    return [p for p in parts if p]


@dataclass
class Chunk:
    kind: str
    page: int
    bbox: dict
    section_path: list[str]
    text: str


def _overlap_prefix(prev_text: str) -> str:
    """Last ~15% of prev_text's tokens, snapped to a sentence boundary."""
    sentences = _split_sentences(prev_text)
    if not sentences:
        return ""
    target = max(1, round(estimate_tokens(prev_text) * OVERLAP_FRACTION))
    picked: list[str] = []
    total = 0
    for s in reversed(sentences):
        picked.insert(0, s)
        total += estimate_tokens(s)
        if total >= target:
            break
    return " ".join(picked)


def _chunk_table_markdown(md: str) -> list[str]:
    """Splits an oversized table's markdown into row-groups, each repeating
    the header + separator lines, so every fragment is still a valid table."""
    lines = md.splitlines()
    if len(lines) < 3:
        return [md]
    header, sep, *rows = lines
    if estimate_tokens(md) <= MAX_TOKENS:
        return [md]

    fragments: list[str] = []
    current_rows: list[str] = []
    current_tokens = estimate_tokens(header) + estimate_tokens(sep)
    for row in rows:
        row_tokens = estimate_tokens(row)
        if current_rows and current_tokens + row_tokens > MAX_TOKENS:
            fragments.append("\n".join([header, sep, *current_rows]))
            current_rows = []
            current_tokens = estimate_tokens(header) + estimate_tokens(sep)
        current_rows.append(row)
        current_tokens += row_tokens
    if current_rows:
        fragments.append("\n".join([header, sep, *current_rows]))
    return fragments


def chunk_blocks(blocks: list[Block]) -> list[Chunk]:
    chunks: list[Chunk] = []
    buffer_sentences: list[str] = []
    buffer_tokens = 0
    buffer_page: Optional[int] = None
    buffer_bbox: Optional[dict] = None
    buffer_section: list[str] = []
    pending_overlap = ""

    def flush():
        nonlocal buffer_sentences, buffer_tokens, buffer_page, buffer_bbox, buffer_section, pending_overlap
        if not buffer_sentences:
            return
        text = " ".join(buffer_sentences)
        chunks.append(
            Chunk(
                kind="text",
                page=buffer_page or 1,
                bbox=buffer_bbox or {"x0": 0, "y0": 0, "x1": 0, "y1": 0},
                section_path=buffer_section,
                text=text,
            )
        )
        pending_overlap = _overlap_prefix(text)
        buffer_sentences = []
        buffer_tokens = 0
        buffer_page = None
        buffer_bbox = None
        buffer_section = []

    for block in blocks:
        if block.kind == "table":
            flush()
            for fragment in _chunk_table_markdown(block.text):
                chunks.append(
                    Chunk(
                        kind="table",
                        page=block.page,
                        bbox=block.bbox.to_dict(),
                        section_path=block.section_path,
                        text=fragment,
                    )
                )
            continue

        if block.kind == "figure_caption":
            flush()
            chunks.append(
                Chunk(
                    kind="figure_caption",
                    page=block.page,
                    bbox=block.bbox.to_dict(),
                    section_path=block.section_path,
                    text=block.text,
                )
            )
            continue

        # text block: accumulate sentence by sentence
        if buffer_page is None:
            buffer_page = block.page
            buffer_bbox = block.bbox.to_dict()
            buffer_section = block.section_path
            if pending_overlap:
                buffer_sentences.append(pending_overlap)
                buffer_tokens += estimate_tokens(pending_overlap)
                pending_overlap = ""

        for sentence in _split_sentences(block.text):
            buffer_sentences.append(sentence)
            buffer_tokens += estimate_tokens(sentence)
            if buffer_tokens >= MIN_TOKENS:
                flush()
                buffer_page = block.page
                buffer_bbox = block.bbox.to_dict()
                buffer_section = block.section_path
                if pending_overlap:
                    buffer_sentences.append(pending_overlap)
                    buffer_tokens += estimate_tokens(pending_overlap)
                    pending_overlap = ""
            elif buffer_tokens >= MAX_TOKENS:
                flush()

    flush()
    return chunks
