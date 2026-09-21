# Documents

## Ingestion (services/ingest)
1. Upload through the API. Check magic bytes and size, and dedupe by sha256. Store files at `data/files/{ws}/{sha}`. Classification comes from the uploader and defaults to the project's. Queue a job.
2. Parse with Docling on CPU. Supported inputs: PDF, DOCX, PPTX, XLSX/CSV, HTML, and images. Extract text blocks with page and bbox, tables as a grid plus markdown, and figure crops. fetch-models.sh prefetches Docling's models.
3. OCR scanned pages with `eng+hin`.
4. Caption each figure with llm-main at low priority. Store the caption as a `figure_caption` chunk linked to its crop.
5. Chunk by layout, 400–600 tokens with about 15% overlap. Each table gets its own chunk, and the header repeats when a table is split. Keep page, bbox, section_path, and kind on every chunk.
6. Copy workspace_id, project_id, classification, and acl_group_ids onto every chunk.
7. Embed in batches. Build `tsv` with `to_tsvector('simple', …)`, because the `english` config breaks Hindi.
8. Run the injection heuristic. A match sets `suspicious=true`: the chunk stays retrievable but is shown with a warning.
9. Set status=ready and emit progress events per page.

Jobs run from the `jobs` table using `FOR UPDATE SKIP LOCKED`, with retries and a dead-letter state.

## Retrieval (apps/api/src/retrieval)
- Search pipeline:
  1. Take vector top-k (HNSW, cosine) and FTS top-k (`websearch_to_tsquery`).
  2. Fuse the two lists with RRF (k=60).
  3. Rerank the top 30 and keep 6–8.
- Every query includes `workspace_id=$w AND project_id=ANY($p) AND classification<=$clearance AND (acl_group_ids && $groups OR acl_group_ids='{}')`, plus unexpired `access_grants`.
- Set `hnsw.iterative_scan=relaxed_order` (requires pgvector ≥ 0.8).
- Each `[n]` citation marker maps to a document, page, and bbox. The viewer highlights the bbox.
- If the best rerank score is below the threshold, doc_qa says it found no support and does not answer from model knowledge.