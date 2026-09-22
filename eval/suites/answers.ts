import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiClient, extractAnswerText } from '../lib/apiClient.js';
import { EVAL_USERS, type CorpusSetup } from '../fixtures/setup.js';

const QUESTIONS_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'questions',
  'answers.json',
);

interface AnswerQuestion {
  question: string;
  expectedKeyword: string;
}

export interface AnswersSuiteRow {
  question: string;
  expectedKeyword: string;
  correct: boolean;
  answerPreview: string;
}

export interface AnswersSuiteResult {
  suite: 'answers';
  accuracy: number;
  rows: AnswersSuiteRow[];
}

/**
 * eval.md's "answers" suite. A2 scores by keyword/substring containment,
 * not LLM-judge correctness — cheaper, deterministic, no judge-prompt
 * engineering yet (see the plan's Open Question #15; upgrading is Debt).
 */
export async function runAnswersSuite(setup: CorpusSetup): Promise<AnswersSuiteResult> {
  const questions = JSON.parse(await readFile(QUESTIONS_PATH, 'utf8')) as AnswerQuestion[];
  const client = new ApiClient(setup.baseUrl);
  await client.login(EVAL_USERS.admin);

  const rows: AnswersSuiteRow[] = [];
  for (const q of questions) {
    const conv = await client.post<{ id: string }>('/conversations', { projectId: setup.projectId });
    const sseText = await client.postMessageRaw(conv.id, q.question);
    const answer = extractAnswerText(sseText);
    const correct = answer.toLowerCase().includes(q.expectedKeyword.toLowerCase());
    rows.push({ question: q.question, expectedKeyword: q.expectedKeyword, correct, answerPreview: answer.slice(0, 200) });
  }

  return {
    suite: 'answers',
    accuracy: rows.filter((r) => r.correct).length / rows.length,
    rows,
  };
}
