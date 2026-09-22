import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCorpus } from './fixtures/setup.js';
import { runRetrievalSuite, type RetrievalSuiteResult } from './suites/retrieval.js';
import { runAclLeakSuite, type AclLeakSuiteResult } from './suites/aclLeak.js';
import { runAnswersSuite, type AnswersSuiteResult } from './suites/answers.js';
import { runRouterSuite, type RouterSuiteResult } from './suites/router.js';

const RESULTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'results');
const BASE_URL = process.env.EVAL_API_URL ?? 'http://localhost:3000';

function renderMarkdown(
  date: string,
  retrieval: RetrievalSuiteResult,
  aclLeak: AclLeakSuiteResult,
  answers: AnswersSuiteResult,
  router: RouterSuiteResult,
): string {
  const lines: string[] = [];
  lines.push(`# Eval report — ${date}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| suite | metric | value | gate |');
  lines.push('|---|---|---|---|');
  lines.push(`| retrieval | recall@5 | ${(retrieval.recallAt5 * 100).toFixed(1)}% | baseline in A2 |`);
  lines.push(`| retrieval | MRR | ${retrieval.mrr.toFixed(3)} | baseline in A2 |`);
  lines.push(`| acl-leak | leak count | ${aclLeak.leakCount} | **must be 0** |`);
  lines.push(`| answers | keyword accuracy | ${(answers.accuracy * 100).toFixed(1)}% | baseline in A2 |`);
  lines.push(`| router | accuracy | ${(router.accuracy * 100).toFixed(1)}% | baseline in A3 (≥0.85 from B3) |`);
  lines.push('');

  lines.push('## retrieval — recall@5 / MRR');
  lines.push('');
  lines.push(`${retrieval.questionCount} questions.`);
  lines.push('');
  lines.push('| question | expected doc | rank | hit |');
  lines.push('|---|---|---|---|');
  for (const row of retrieval.rows) {
    lines.push(
      `| ${row.question} | ${row.expectedFilename} | ${row.rank ?? 'not found'} | ${row.hit ? '✅' : '❌'} |`,
    );
  }
  lines.push('');

  lines.push('## acl-leak');
  lines.push('');
  lines.push(aclLeak.leakCount === 0 ? '**PASS — 0 leaks.**' : `**FAIL — ${aclLeak.leakCount} leak(s) found.**`);
  lines.push('');
  lines.push('| user | question | leaked | answer preview |');
  lines.push('|---|---|---|---|');
  for (const row of aclLeak.rows) {
    lines.push(
      `| ${row.userEmail} | ${row.question} | ${row.leaked ? '🚨 YES' : 'no'} | ${row.answerPreview.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`,
    );
  }
  lines.push('');

  lines.push('## answers (keyword containment)');
  lines.push('');
  lines.push('| question | expected keyword | correct | answer preview |');
  lines.push('|---|---|---|---|');
  for (const row of answers.rows) {
    lines.push(
      `| ${row.question} | ${row.expectedKeyword} | ${row.correct ? '✅' : '❌'} | ${row.answerPreview.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`,
    );
  }
  lines.push('');

  lines.push('## router');
  lines.push('');
  lines.push('| prompt | expected agent | actual agent | correct | reason |');
  lines.push('|---|---|---|---|---|');
  for (const row of router.rows) {
    lines.push(
      `| ${row.prompt} | ${row.expectedAgent} | ${row.actualAgent} | ${row.correct ? '✅' : '❌'} | ${row.reason.replace(/\|/g, '\\|')} |`,
    );
  }
  lines.push('');

  return lines.join('\n');
}

async function main() {
  console.log(`Setting up corpus against ${BASE_URL}...`);
  const setup = await setupCorpus(BASE_URL, { waitForIngestion: true });
  console.log(`Corpus ready: ${Object.keys(setup.documentIdByFilename).length} documents.`);

  console.log('Running retrieval suite...');
  const retrieval = await runRetrievalSuite(setup.adminClient, setup);
  console.log(`  recall@5=${(retrieval.recallAt5 * 100).toFixed(1)}% MRR=${retrieval.mrr.toFixed(3)}`);

  console.log('Running ACL-leak suite...');
  const aclLeak = await runAclLeakSuite(setup);
  console.log(`  leak count=${aclLeak.leakCount}`);

  console.log('Running answers suite...');
  const answers = await runAnswersSuite(setup);
  console.log(`  accuracy=${(answers.accuracy * 100).toFixed(1)}%`);

  console.log('Running router suite...');
  const router = await runRouterSuite(setup);
  console.log(`  accuracy=${(router.accuracy * 100).toFixed(1)}%`);

  const date = new Date().toISOString().slice(0, 10);
  const markdown = renderMarkdown(date, retrieval, aclLeak, answers, router);
  await mkdir(RESULTS_DIR, { recursive: true });
  const outPath = path.join(RESULTS_DIR, `${date}.md`);
  await writeFile(outPath, markdown);
  console.log(`\nReport written to ${outPath}`);

  if (aclLeak.leakCount > 0) {
    console.error(`\nFAIL: acl-leak suite found ${aclLeak.leakCount} leak(s) — this must be 0.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Eval run failed:', err);
  process.exit(1);
});
