"""OpeX ingest service.

A1 only proves the Python/Docker/offline toolchain works end to end — there's
no `jobs` table yet for it to poll. Real document ingestion (Docling,
chunking, embeddings) is built in A2 (see docs/spec/documents.md).
"""

from fastapi import FastAPI

app = FastAPI(title="opex-ingest")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
