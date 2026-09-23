import { z } from 'zod';
import type { ModelGateway } from '../models/gateway.js';
import type { AuthedUser } from '../policy/types.js';
import { extractCitedMarkers } from '../retrieval/citations.js';
import { verifyCitations } from './verifier.js';

export interface CitedChunk {
  marker: number;
  text: string;
}

export interface GroundednessSentence {
  text: string;
  markers: number[];
  verdict: 'supported' | 'partial' | 'unsupported';
}

export interface GroundednessResult {
  ok: boolean;
  sentences: GroundednessSentence[];
  unsupportedSentences: string[];
}

const GROUNDEDNESS_SCHEMA = {
  name: 'groundedness_check',
  schema: {
    type: 'object',
    properties: {
      sentences: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'number' },
            verdict: { type: 'string', enum: ['supported', 'partial', 'unsupported'] },
          },
          required: ['index', 'verdict'],
        },
      },
    },
    required: ['sentences'],
  },
};

const groundednessResponseSchema = z.object({
  sentences: z.array(z.object({ index: z.number(), verdict: z.enum(['supported', 'partial', 'unsupported']) })),
});

const GROUNDEDNESS_SYSTEM_PROMPT =
  'For each numbered sentence, decide whether the cited chunk text actually supports its claim. ' +
  '"supported": every factual claim in the sentence is backed by the cited text. ' +
  '"partial": some of the claim is backed but it adds unsupported detail. ' +
  '"unsupported": the cited text does not back this claim at all, or no chunk was cited for a factual claim. ' +
  'Return one verdict per sentence index, per the JSON schema.';

/** Lightweight, deterministic — good enough for short doc_qa answers; reuses citations.ts's marker regex, not a second one. */
function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * B3b's sentence-level groundedness check: one batched LLM call (not
 * one-per-sentence — CPU latency budget) classifying each sentence
 * against its own cited chunk text. Fail-safe fallback on parse failure:
 * A3's deterministic marker-presence check (verifyCitations), not a
 * blanket "unsupported" — llm-small/general format degeneration is a
 * documented, observed problem, and failing toward maximal distrust would
 * cause revise-loop thrash on every parse hiccup.
 */
export async function verifyGroundedness(
  deps: { gateway: ModelGateway; user: AuthedUser; traceId: string },
  answerText: string,
  citedChunks: CitedChunk[],
  validMarkers: Set<number>,
): Promise<GroundednessResult> {
  const withMarkers = splitIntoSentences(answerText).map((text) => ({ text, markers: extractCitedMarkers(text) }));
  const anyClaims = withMarkers.some((s) => s.markers.length > 0);
  if (!anyClaims) {
    // No cited claims to check — trivially grounded (matches doc_qa's own
    // "say plainly you found no supporting documents" instruction).
    return { ok: true, sentences: withMarkers.map((s) => ({ ...s, verdict: 'supported' as const })), unsupportedSentences: [] };
  }

  const chunkTextByMarker = new Map(citedChunks.map((c) => [c.marker, c.text]));
  const prompt = withMarkers
    .map((s, i) => {
      const cited = s.markers
        .map((m) => chunkTextByMarker.get(m))
        .filter((t): t is string => Boolean(t))
        .join('\n---\n');
      return `Sentence ${i}: "${s.text}"\nCited chunk text: ${cited || '(none cited)'}`;
    })
    .join('\n\n');

  try {
    const result = await deps.gateway.chat({
      role: 'general',
      messages: [
        { role: 'system', content: GROUNDEDNESS_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      jsonSchema: GROUNDEDNESS_SCHEMA,
      user: deps.user,
      traceId: deps.traceId,
    });
    const parsed = groundednessResponseSchema.safeParse(JSON.parse(result.content));
    if (!parsed.success) throw new Error('groundedness response failed schema validation');

    const verdictByIndex = new Map(parsed.data.sentences.map((s) => [s.index, s.verdict]));
    const sentences = withMarkers.map((s, i) => ({ ...s, verdict: verdictByIndex.get(i) ?? ('unsupported' as const) }));
    const unsupported = sentences.filter((s) => s.markers.length > 0 && s.verdict === 'unsupported');
    return { ok: unsupported.length === 0, sentences, unsupportedSentences: unsupported.map((s) => s.text) };
  } catch {
    const fallback = verifyCitations(answerText, validMarkers);
    const sentences = withMarkers.map((s) => ({
      ...s,
      verdict: (fallback.ok || s.markers.every((m) => validMarkers.has(m)) ? 'supported' : 'unsupported') as
        | 'supported'
        | 'unsupported',
    }));
    const unsupported = sentences.filter((s) => s.verdict === 'unsupported');
    return { ok: fallback.ok, sentences, unsupportedSentences: unsupported.map((s) => s.text) };
  }
}
