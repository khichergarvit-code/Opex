import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CorpusSetup } from '../fixtures/setup.js';

const QUESTIONS_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'questions',
  'router.json',
);

interface RouterQuestion {
  prompt: string;
  attachmentMimes: string[];
  expectedAgent: string;
}

export interface RouterSuiteRow {
  prompt: string;
  expectedAgent: string;
  actualAgent: string;
  correct: boolean;
  reason: string;
}

export interface RouterSuiteResult {
  suite: 'router';
  accuracy: number;
  rows: RouterSuiteRow[];
}

/**
 * eval.md's "router" suite (≥30 prompts). A3 just records accuracy — the
 * ≥0.85 gate is explicitly B3, not A3.
 */
export async function runRouterSuite(setup: CorpusSetup): Promise<RouterSuiteResult> {
  const questions = JSON.parse(await readFile(QUESTIONS_PATH, 'utf8')) as RouterQuestion[];
  const rows: RouterSuiteRow[] = [];

  for (const q of questions) {
    const decision = await setup.adminClient.post<{ agent: string; reason: string }>(
      `/projects/${setup.projectId}/route-debug`,
      { message: q.prompt, attachmentMimes: q.attachmentMimes },
    );
    rows.push({
      prompt: q.prompt,
      expectedAgent: q.expectedAgent,
      actualAgent: decision.agent,
      correct: decision.agent === q.expectedAgent,
      reason: decision.reason,
    });
  }

  return {
    suite: 'router',
    accuracy: rows.filter((r) => r.correct).length / rows.length,
    rows,
  };
}
