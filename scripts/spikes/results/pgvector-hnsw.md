# Spike D results — does a filtered HNSW query in pgvector still return k rows?

Run: raw SQL equivalent of `scripts/spikes/pgvector-hnsw.ts` against the
real `opex-postgres-1` container (pgvector 0.8.6, from
`pgvector/pgvector:pg16`), via `docker compose exec postgres psql`.

Setup: 5000 synthetic 64-dim vectors, only 2% (`group-a`, ~100 rows) pass
the ACL filter — a stress case chosen to be much harder than a real corpus's
filter selectivity. Query: `WHERE acl_group = 'group-a' ORDER BY embedding
<-> :query LIMIT 5`, filter **inside** the SQL per invariant #4 (never
post-filter).

## Result: **PASS**

| condition | rows returned (k=5) |
|---|---|
| default `hnsw.ef_search` | 5/5 |
| `hnsw.ef_search = 200` | 5/5 |

Both the default and a manually raised `ef_search` returned the full `k`
rows even at this aggressive 2%-selectivity filter. `hnsw.iterative_scan` is
also available (pgvector 0.8.6 ships it) as a documented fallback if a real
A2 corpus's filter selectivity turns out to be worse than this synthetic
test.

## Fallback

Not needed — the default HNSW behavior already satisfies the k-rows
requirement at this selectivity. If A2's real corpus proves harder (e.g.
per-user ACLs excluding >99% of rows), the two fallbacks from the plan
remain available: over-fetch N×k candidates and truncate in the same SQL
statement, or enable `hnsw.iterative_scan` (confirmed supported by this
pgvector version).
