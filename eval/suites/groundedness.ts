import { ApiClient, extractAnswerText } from '../lib/apiClient.js';
import { EVAL_USERS, type CorpusSetup } from '../fixtures/setup.js';

export interface GroundednessSuiteRow {
  case: string;
  passed: boolean;
  detail: string;
}

export interface GroundednessSuiteResult {
  suite: 'groundedness';
  passCount: number;
  rows: GroundednessSuiteRow[];
}

interface GroundednessDebugResult {
  ok: boolean;
  unsupportedSentences: string[];
}

/**
 * eval.md's "groundedness" suite (B3b AC): the verifier catches a seeded
 * unsupported claim. Case 1 seeds a hand-crafted draft answer directly
 * (via /groundedness-debug) rather than relying on a model to actually
 * hallucinate a specific claim, which isn't reliably reproducible — same
 * reasoning the plan gives for unit-testing verifyGroundedness() rather
 * than only testing it end to end. Case 2 is the one full live round-trip:
 * a real doc_qa call must report a confidence/revisions pair on its
 * verify event.
 */
export async function runGroundednessSuite(setup: CorpusSetup): Promise<GroundednessSuiteResult> {
  const rows: GroundednessSuiteRow[] = [];
  const admin = new ApiClient(setup.baseUrl);
  await admin.login(EVAL_USERS.admin);

  // Case 1: a chunk supports fact X ("50 Nm") but not fact Y ("500 Nm") —
  // a hand-crafted draft answer claims Y and cites the chunk anyway.
  const supportedResult = await admin.post<GroundednessDebugResult>('/groundedness-debug', {
    answerText: 'The discharge flange bolt torque spec is 50 Nm [1].',
    citedChunks: [{ marker: 1, text: 'Torque spec for the discharge flange bolts: 50 Nm.' }],
    validMarkers: [1],
  });
  const unsupportedResult = await admin.post<GroundednessDebugResult>('/groundedness-debug', {
    answerText: 'The discharge flange bolt torque spec is 500 Nm [1].',
    citedChunks: [{ marker: 1, text: 'Torque spec for the discharge flange bolts: 50 Nm.' }],
    validMarkers: [1],
  });
  const case1Passed = supportedResult.ok === true && unsupportedResult.ok === false;
  rows.push({
    case: 'verifier catches a seeded unsupported claim',
    passed: case1Passed,
    detail: `supported.ok=${supportedResult.ok} unsupported.ok=${unsupportedResult.ok} unsupportedSentences=${JSON.stringify(unsupportedResult.unsupportedSentences)}`,
  });

  // Case 2: a real doc_qa round trip reports confidence/revisions.
  const internal = new ApiClient(setup.baseUrl);
  await internal.login(EVAL_USERS.internal);
  const conv = await internal.post<{ id: string }>('/conversations', { projectId: setup.projectId });
  const sseText = await internal.postMessageRaw(conv.id, 'What is the torque spec for the discharge flange bolts?');
  const answer = extractAnswerText(sseText);
  const hasVerifyEvent = sseText.includes('event: verify');
  const hasConfidenceField = /"confidence":"(high|low)"/.test(sseText);
  rows.push({
    case: 'a real doc_qa round trip reports a confidence/revisions pair',
    passed: hasVerifyEvent && hasConfidenceField,
    detail: `hasVerifyEvent=${hasVerifyEvent} hasConfidenceField=${hasConfidenceField} answer=${answer.slice(0, 150)}`,
  });

  return { suite: 'groundedness', passCount: rows.filter((r) => r.passed).length, rows };
}
