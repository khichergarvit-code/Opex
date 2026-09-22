"""Direct HTTP client to llm-embed — bypasses apps/api's TS ModelGateway
deliberately: ingest is a separate Python process and can't import a TS
class. This is the one documented exception to "call models only via
gateway.ts". Every call still writes its own span (invariant #6).
"""

from __future__ import annotations

import time
from typing import Optional

import httpx

from . import db as db_mod

BATCH_SIZE = 32


async def embed_texts(
    pool,
    llm_embed_url: str,
    texts: list[str],
    trace_id: str,
) -> list[list[float]]:
    embeddings: list[list[float]] = []
    async with httpx.AsyncClient(timeout=120.0) as client:
        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i : i + BATCH_SIZE]
            started = time.monotonic()
            status = "ok"
            tokens_in: Optional[int] = None
            try:
                res = await client.post(f"{llm_embed_url}/v1/embeddings", json={"input": batch})
                res.raise_for_status()
                data = res.json()
                tokens_in = (data.get("usage") or {}).get("prompt_tokens")
                embeddings.extend(item["embedding"] for item in data["data"])
            except Exception:
                status = "error"
                raise
            finally:
                await db_mod.write_span(
                    pool,
                    trace_id=trace_id,
                    kind="llm",
                    name="ingest.embed",
                    model="llm-embed",
                    tokens_in=tokens_in,
                    latency_ms=int((time.monotonic() - started) * 1000),
                    status=status,
                )
    return embeddings
