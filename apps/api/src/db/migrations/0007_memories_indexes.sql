-- HNSW index for cosine-similarity search over memory embeddings, same
-- pattern as chunks_embedding_hnsw_idx (0004). Plus lookup indexes for
-- memoryAclFilter.ts's WHERE clause and the extraction scheduler's idle-
-- conversation scan.
CREATE INDEX memories_embedding_hnsw_idx ON memories USING hnsw (embedding vector_cosine_ops);
CREATE INDEX memories_scope_lookup_idx ON memories (scope, user_id, project_id, workspace_id) WHERE deleted_at IS NULL;
