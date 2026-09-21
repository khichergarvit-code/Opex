-- Generated column, not a normal Drizzle field — queried/written only via
-- raw SQL in retrieval.ts (see chunks.ts's comment). 'simple' config
-- deliberately, so Hindi text isn't broken by English stemming.
ALTER TABLE chunks ADD COLUMN tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', text)) STORED;

CREATE INDEX chunks_tsv_idx ON chunks USING GIN (tsv);
CREATE INDEX chunks_acl_group_ids_idx ON chunks USING GIN (acl_group_ids);
CREATE INDEX chunks_embedding_hnsw_idx ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX chunks_workspace_project_class_idx ON chunks (workspace_id, project_id, classification);
