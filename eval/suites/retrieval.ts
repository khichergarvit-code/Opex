import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ApiClient } from '../lib/apiClient.js';
import { computeRecallAndMrr } from '../lib/metrics.js';
import type { CorpusSetup } from '../fixtures/setup.js';

const QUESTIONS_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'questions',
  'retrieval.json',
);

interface RetrievalQuestion {
  question: string;
  expectedFilename: string;
}

interface RetrievalDebugResponse {
  noSupport: boolean;
  chunks: Array<{ documentId: string; page: number; score: number }>;
}

export interface RetrievalSuiteRow {
  question: string;
  expectedFilename: string;
  rank: number | null; // 1-indexed position of the expected doc in results, null if not found
  hit: boolean;
}

export interface RetrievalSuiteResult {
  suite: 'retrieval';
  questionCount: number;
  recallAt5: number;
  mrr: number;
  rows: RetrievalSuiteRow[];
}

/**
 * recall@5 + MRR against the seed corpus (eval.md's "retrieval" suite).
 * A2 gate: baseline recorded, no pass/fail threshold (that's B7's ≥0.8).
 */
export async function runRetrievalSuite(
  client: ApiClient,
  setup: CorpusSetup,
): Promise<RetrievalSuiteResult> {
  const questions = JSON.parse(await readFile(QUESTIONS_PATH, 'utf8')) as RetrievalQuestion[];
  const rows: RetrievalSuiteRow[] = [];

  for (const q of questions) {
    const expectedDocId = setup.documentIdByFilename[q.expectedFilename];
    if (!expectedDocId) {
      rows.push({ question: q.question, expectedFilename: q.expectedFilename, rank: null, hit: false });
      continue;
    }
    const result = await client.post<RetrievalDebugResponse>(
      `/projects/${setup.projectId}/retrieval-debug`,
      { query: q.question },
    );
    const rank = result.chunks.findIndex((c) => c.documentId === expectedDocId);
    rows.push({
      question: q.question,
      expectedFilename: q.expectedFilename,
      rank: rank === -1 ? null : rank + 1,
      hit: rank !== -1 && rank < 5,
    });
  }

  const { recallAt5, mrr } = computeRecallAndMrr(rows);

  return {
    suite: 'retrieval',
    questionCount: rows.length,
    recallAt5,
    mrr,
    rows,
  };
}
