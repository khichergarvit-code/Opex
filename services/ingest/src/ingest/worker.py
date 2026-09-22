"""Ingest worker entrypoint: polls the jobs table (FOR UPDATE SKIP LOCKED)
and processes ingest_document jobs end to end. Single-threaded — Docling's
real throughput (~39 CPU-s/page, measured in A1's spike) makes parallelism
premature before real corpus sizes are known (Debt).

Runs alongside main.py's FastAPI /health app in the same process so the
existing Docker healthcheck keeps working.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from pathlib import Path

import uvicorn

from . import chunking, db, injection
from .captions import placeholder_caption
from .docling_parse import parse_document
from .embed_client import embed_texts
from .main import app
from .ocr import ocr_page

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("ingest.worker")

POLL_INTERVAL_SECONDS = 1.0


async def process_ingest_job(pool, payload: dict, data_dir: Path, llm_embed_url: str) -> None:
    document_id = payload["documentId"]
    doc = await db.get_document(pool, document_id)
    if doc is None:
        raise RuntimeError(f"document {document_id} not found")

    await db.set_document_status(pool, document_id, "processing")
    trace_id = await db.open_trace(pool, str(doc["uploaded_by"]))

    file_path = data_dir / "files" / str(doc["workspace_id"]) / doc["sha256"]
    figures_dir = data_dir / "figures" / str(doc["workspace_id"]) / doc["sha256"]

    started = time.monotonic()
    try:
        parsed = parse_document(file_path, figures_dir)

        # OCR any page Docling found no text layer on.
        for page_no in sorted(parsed.pages_needing_ocr):
            image = parsed.page_images.get(page_no)
            if image is None:
                continue
            text = ocr_page(image)
            if text:
                from .docling_parse import Bbox, Block

                parsed.blocks.append(
                    Block(
                        kind="text",
                        page=page_no,
                        bbox=Bbox(x0=0, y0=0, x1=image.width, y1=image.height),
                        section_path=[],
                        text=text,
                    )
                )
            await db.set_pages_done(pool, document_id, page_no)

        # fill in figure captions (placeholder — see captions.py)
        for block in parsed.blocks:
            if block.kind == "figure_caption" and not block.text:
                block.text = placeholder_caption(block.page)

        chunks = chunking.chunk_blocks(parsed.blocks)

        texts = [c.text for c in chunks]
        embeddings = await embed_texts(pool, llm_embed_url, texts, trace_id) if texts else []

        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            await db.insert_chunk(
                pool,
                {
                    "document_id": document_id,
                    "workspace_id": doc["workspace_id"],
                    "project_id": doc["project_id"],
                    "classification": doc["classification"],
                    "acl_group_ids": doc["acl_group_ids"],
                    "kind": chunk.kind,
                    "page": chunk.page,
                    "bbox": chunk.bbox,
                    "section_path": chunk.section_path,
                    "text": chunk.text,
                    "embedding": embedding,
                    "suspicious": injection.is_suspicious(chunk.text),
                    "chunk_index": i,
                },
            )

        for page_no in range(1, parsed.page_count + 1):
            await db.set_pages_done(pool, document_id, page_no)

        await db.set_document_status(pool, document_id, "ready", page_count=parsed.page_count)
        await db.close_trace(pool, trace_id, "ok")
        logger.info("ingested document %s: %d chunks in %.1fs", document_id, len(chunks), time.monotonic() - started)
    except Exception as exc:
        await db.set_document_status(pool, document_id, "failed", error_message=str(exc))
        await db.close_trace(pool, trace_id, "error")
        raise


async def poll_loop(pool, data_dir: Path, llm_embed_url: str) -> None:
    while True:
        job = await db.claim_job(pool, "ingest_document")
        if job is None:
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
            continue
        try:
            await process_ingest_job(pool, dict(job["payload"]), data_dir, llm_embed_url)
            await db.complete_job(pool, str(job["id"]))
        except Exception as exc:  # noqa: BLE001 - a job failure must not kill the worker loop
            logger.exception("job %s failed", job["id"])
            await db.fail_job(pool, str(job["id"]), job["attempts"], job["max_attempts"], str(exc))


async def main() -> None:
    database_url = os.environ["DATABASE_URL"]
    data_dir = Path(os.environ.get("DATA_DIR", "./data"))
    llm_embed_url = os.environ.get("LLM_EMBED_URL", "http://llm-embed:8083")
    port = int(os.environ.get("PORT", "8000"))

    pool = await db.create_pool(database_url)

    config = uvicorn.Config(app, host="0.0.0.0", port=port, log_level="warning")
    server = uvicorn.Server(config)

    await asyncio.gather(server.serve(), poll_loop(pool, data_dir, llm_embed_url))


if __name__ == "__main__":
    asyncio.run(main())
