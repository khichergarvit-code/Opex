"""Postgres access for the ingest worker: job claiming and direct writes to
chunks/spans/traces/documents. Deliberately raw SQL, not an ORM — this is a
small, single-purpose worker and the schema is owned by apps/api's Drizzle
migrations (never edit here, only read/write rows).
"""

from __future__ import annotations

import json
import os
import socket
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import asyncpg

WORKER_ID = f"{socket.gethostname()}-{os.getpid()}"

BACKOFF_BASE_SECONDS = 30
BACKOFF_MAX_SECONDS = 600


async def create_pool(database_url: str) -> asyncpg.Pool:
    return await asyncpg.create_pool(database_url, min_size=1, max_size=4)


async def claim_job(pool: asyncpg.Pool, kind: str) -> Optional[asyncpg.Record]:
    async with pool.acquire() as conn:
        return await conn.fetchrow(
            """
            UPDATE jobs SET status='running', locked_at=now(), locked_by=$2,
                            attempts=attempts+1, updated_at=now()
            WHERE id = (
                SELECT id FROM jobs
                WHERE status='pending' AND run_at <= now() AND kind = $1
                ORDER BY created_at
                FOR UPDATE SKIP LOCKED
                LIMIT 1
            )
            RETURNING *
            """,
            kind,
            WORKER_ID,
        )


async def complete_job(pool: asyncpg.Pool, job_id: str) -> None:
    await pool.execute(
        "UPDATE jobs SET status='done', updated_at=now() WHERE id = $1", job_id
    )


async def fail_job(pool: asyncpg.Pool, job_id: str, attempts: int, max_attempts: int, error: str) -> None:
    if attempts >= max_attempts:
        await pool.execute(
            "UPDATE jobs SET status='dead_letter', last_error=$2, updated_at=now() WHERE id = $1",
            job_id,
            error,
        )
        return
    backoff = min(BACKOFF_BASE_SECONDS * (2 ** attempts), BACKOFF_MAX_SECONDS)
    run_at = datetime.now(timezone.utc) + timedelta(seconds=backoff)
    await pool.execute(
        "UPDATE jobs SET status='pending', last_error=$2, run_at=$3, updated_at=now() WHERE id = $1",
        job_id,
        error,
        run_at,
    )


async def get_document(pool: asyncpg.Pool, document_id: str) -> Optional[asyncpg.Record]:
    return await pool.fetchrow("SELECT * FROM documents WHERE id = $1", document_id)


async def set_document_status(
    pool: asyncpg.Pool,
    document_id: str,
    status: str,
    page_count: Optional[int] = None,
    error_message: Optional[str] = None,
) -> None:
    await pool.execute(
        """
        UPDATE documents
        SET status = $2,
            page_count = COALESCE($3, page_count),
            error_message = $4,
            updated_at = now()
        WHERE id = $1
        """,
        document_id,
        status,
        page_count,
        error_message,
    )


async def set_pages_done(pool: asyncpg.Pool, document_id: str, pages_done: int) -> None:
    await pool.execute(
        "UPDATE documents SET pages_done = $2, updated_at = now() WHERE id = $1",
        document_id,
        pages_done,
    )


async def insert_chunk(pool: asyncpg.Pool, chunk: dict[str, Any]) -> None:
    await pool.execute(
        """
        INSERT INTO chunks
            (id, document_id, workspace_id, project_id, classification, acl_group_ids,
             kind, page, bbox, section_path, text, embedding, suspicious, chunk_index)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        """,
        chunk["document_id"],
        chunk["workspace_id"],
        chunk["project_id"],
        chunk["classification"],
        chunk["acl_group_ids"],
        chunk["kind"],
        chunk["page"],
        json.dumps(chunk["bbox"]),
        chunk["section_path"],
        chunk["text"],
        _to_pgvector_literal(chunk.get("embedding")),
        chunk["suspicious"],
        chunk["chunk_index"],
    )


def _to_pgvector_literal(embedding: Optional[list[float]]) -> Optional[str]:
    if embedding is None:
        return None
    return "[" + ",".join(str(x) for x in embedding) + "]"


async def open_trace(pool: asyncpg.Pool, user_id: str) -> str:
    row = await pool.fetchrow(
        "INSERT INTO traces (id, user_id, status) VALUES (gen_random_uuid(), $1, 'running') RETURNING id",
        user_id,
    )
    return str(row["id"])


async def close_trace(pool: asyncpg.Pool, trace_id: str, status: str) -> None:
    await pool.execute(
        "UPDATE traces SET status = $2, ended_at = now() WHERE id = $1", trace_id, status
    )


async def write_span(
    pool: asyncpg.Pool,
    trace_id: str,
    kind: str,
    name: str,
    latency_ms: int,
    status: str,
    model: Optional[str] = None,
    tokens_in: Optional[int] = None,
    tokens_out: Optional[int] = None,
    attrs: Optional[dict[str, Any]] = None,
) -> None:
    await pool.execute(
        """
        INSERT INTO spans (id, trace_id, kind, name, model, tokens_in, tokens_out, latency_ms, status, attrs)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
        """,
        trace_id,
        kind,
        name,
        model,
        tokens_in,
        tokens_out,
        latency_ms,
        status,
        json.dumps(attrs or {}),
    )
