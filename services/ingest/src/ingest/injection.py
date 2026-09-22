"""Regex/keyword injection heuristic (documents.md step 8). A match sets
suspicious=true — the chunk stays retrievable, doc_qa wraps it in a visible
warning at answer time (the actual enforcement point, not this filter).
"""

from __future__ import annotations

import re

_PATTERNS = [
    re.compile(r"ignore\s+(all\s+|any\s+)?(previous\s+)?instructions", re.IGNORECASE),
    re.compile(r"disregard (the )?(above|previous|prior)", re.IGNORECASE),
    re.compile(r"you are now\b", re.IGNORECASE),
    re.compile(r"new instructions\s*:", re.IGNORECASE),
    re.compile(r"system prompt", re.IGNORECASE),
    re.compile(r"act as (an?|the)\b.{0,30}\b(admin|administrator|root|system)", re.IGNORECASE),
    # a long base64-looking run (>=40 chars) sitting near an imperative verb
    re.compile(r"\b(run|execute|decode|eval)\b[^\n]{0,40}[A-Za-z0-9+/]{40,}={0,2}", re.IGNORECASE),
    # zero-width / invisible unicode runs sometimes used to hide instructions
    re.compile(r"[​‌‍⁠﻿]{3,}"),
]


def is_suspicious(text: str) -> bool:
    return any(p.search(text) for p in _PATTERNS)
