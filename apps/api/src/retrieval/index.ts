import type { Db } from '../db/client.js';
import type { ModelGateway, SpanWriter } from '../models/gateway.js';
import type { AuthedUser } from '../policy/types.js';
import { ftsSearch } from './ftsSearch.js';
import { rerankChunks, selectWithoutRerank } from './rerank.js';
import { rrfFuse } from './rrf.js';
import type { SearchOutcome, SearchParams } from './types.js';
import { vectorSearch } from './vectorSearch.js';

export * from './citations.js';
export * from './types.js';
export { NO_SUPPORT_THRESHOLD } from './rerank.js';

export interface SearchDeps {
  db: Db;
  gateway: ModelGateway;
  spanWriter: SpanWriter;
  user: AuthedUser;
  traceId: string;
}

/**
 * The retrieval pipeline: vector top-k + FTS top-k, fused with RRF,
 * reranked, thresholded. Every query embeds the ACL filter directly in SQL
 * (see aclFilter.ts) — never post-filtered here or by any caller. Writes
 * one kind:'retrieval' span wrapping the whole call (invariant #6) — the
 * embed and rerank sub-calls each write their own kind:'llm' span via the
 * gateway already.
 */
export async function search(deps: SearchDeps, params: SearchParams): Promise<SearchOutcome> {
  const vectorTopK = params.vectorTopK ?? 30;
  const ftsTopK = params.ftsTopK ?? 30;
  const finalK = params.finalK ?? 8;
  const started = Date.now();

  try {
    const [queryEmbedding] = await deps.gateway.embed({
      texts: [params.query],
      user: deps.user,
      traceId: deps.traceId,
    });
    if (!queryEmbedding) {
      throw new Error('failed to embed query');
    }

    const [vectorResults, ftsResults] = await Promise.all([
      vectorSearch(deps.db, params, queryEmbedding, vectorTopK),
      ftsSearch(deps.db, params, ftsTopK),
    ]);

    const fused = rrfFuse(vectorResults, ftsResults).slice(0, 30);
    const result = (await deps.gateway.hasRole('rerank'))
      ? await rerankChunks(deps.gateway, deps.user, deps.traceId, params.query, fused, finalK)
      : selectWithoutRerank(fused, vectorResults, ftsResults, finalK);

    const latencyMs = Date.now() - started;
    await deps.spanWriter.writeSpan({
      traceId: deps.traceId,
      kind: 'retrieval',
      name: 'retrieval.search',
      latencyMs,
      status: 'ok',
      attrs: {
        vectorCandidates: vectorResults.length,
        ftsCandidates: ftsResults.length,
        returned: result.chunks.length,
        noSupport: result.noSupport,
      },
    });
    return { ...result, latencyMs };
  } catch (err) {
    await deps.spanWriter.writeSpan({
      traceId: deps.traceId,
      kind: 'retrieval',
      name: 'retrieval.search',
      latencyMs: Date.now() - started,
      status: 'error',
      attrs: { error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}
