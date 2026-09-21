/**
 * Spike D: does a filtered HNSW query in pgvector still return k rows?
 *
 * Builds a throwaway table shaped like chunks' relevant columns (embedding +
 * acl_group_ids), seeds it with synthetic vectors where most rows are
 * excluded by the ACL filter, then runs the same query shape retrieval.ts
 * will use in A2: an ANN order-by inside a WHERE clause (never post-filter,
 * per invariant #4) and checks whether k rows still come back.
 *
 * Run: DATABASE_URL=postgres://... tsx scripts/spikes/pgvector-hnsw.ts
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Set DATABASE_URL to a reachable Postgres with the pgvector extension enabled.');
  process.exit(1);
}

const DIM = 64;
const TOTAL_ROWS = 5000;
const ALLOWED_GROUP = 'group-a';
const ALLOWED_FRACTION = 0.02; // only 2% of rows pass the ACL filter — a stress case
const K = 5;

function randomVector(dim: number): number[] {
  return Array.from({ length: dim }, () => Math.random() * 2 - 1);
}

function toPgVector(v: number[]): string {
  return `[${v.join(',')}]`;
}

async function main() {
  const sql = postgres(DATABASE_URL!);
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;
    await sql`DROP TABLE IF EXISTS spike_chunks`;
    await sql`
      CREATE TABLE spike_chunks (
        id serial PRIMARY KEY,
        acl_group text NOT NULL,
        embedding vector(${sql.unsafe(String(DIM))})
      )
    `;

    console.log(`Seeding ${TOTAL_ROWS} rows (${(ALLOWED_FRACTION * 100).toFixed(1)}% allowed)...`);
    const rows = Array.from({ length: TOTAL_ROWS }, (_, i) => ({
      acl_group: i < TOTAL_ROWS * ALLOWED_FRACTION ? ALLOWED_GROUP : 'group-b',
      embedding: toPgVector(randomVector(DIM)),
    }));
    const batchSize = 250;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      await sql.begin((tx) =>
        Promise.all(
          batch.map(
            (r) =>
              tx`INSERT INTO spike_chunks (acl_group, embedding) VALUES (${r.acl_group}, ${r.embedding}::vector)`,
          ),
        ),
      );
    }

    await sql`CREATE INDEX spike_chunks_hnsw ON spike_chunks USING hnsw (embedding vector_l2_ops)`;
    await sql`ANALYZE spike_chunks`;

    const pgvectorVersion = await sql`SELECT extversion FROM pg_extension WHERE extname = 'vector'`;
    console.log('pgvector version:', pgvectorVersion[0]?.extversion);

    const query = toPgVector(randomVector(DIM));

    const withoutTuning = await sql`
      SELECT id FROM spike_chunks
      WHERE acl_group = ${ALLOWED_GROUP}
      ORDER BY embedding <-> ${query}::vector
      LIMIT ${K}
    `;
    console.log(`Default ef_search: got ${withoutTuning.length}/${K} rows`);

    await sql`SET hnsw.ef_search = 200`;
    const withTuning = await sql`
      SELECT id FROM spike_chunks
      WHERE acl_group = ${ALLOWED_GROUP}
      ORDER BY embedding <-> ${query}::vector
      LIMIT ${K}
    `;
    console.log(`hnsw.ef_search=200: got ${withTuning.length}/${K} rows`);

    const iterativeScanSupported = await sql`
      SELECT count(*) FROM pg_settings WHERE name = 'hnsw.iterative_scan'
    `;
    console.log(
      'hnsw.iterative_scan setting present:',
      Number(iterativeScanSupported[0]?.count) > 0,
    );

    await sql`DROP TABLE spike_chunks`;

    const result = withTuning.length >= K ? 'PASS' : 'FAIL';
    console.log(
      `\nResult: ${result} — see scripts/spikes/results/pgvector-hnsw.md for the fallback if this is FAIL.`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
