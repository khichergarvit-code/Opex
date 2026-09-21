import type { Db } from '../db/client.js';
import { spans } from '../db/schema/index.js';
import type { SpanWriter } from '../models/gateway.js';

/** Concrete DB-backed SpanWriter — every LLM/retrieval/memory/tool/policy action gets one (invariant #6). */
export function createDbSpanWriter(db: Db): SpanWriter {
  return {
    async writeSpan(span) {
      await db.insert(spans).values({
        traceId: span.traceId,
        kind: span.kind,
        name: span.name,
        model: span.model,
        tokensIn: span.tokensIn,
        tokensOut: span.tokensOut,
        latencyMs: span.latencyMs,
        status: span.status,
        attrs: span.attrs ?? {},
      });
    },
  };
}
