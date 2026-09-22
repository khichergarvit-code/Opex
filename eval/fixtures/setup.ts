import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiClient } from '../lib/apiClient.js';

const CORPUS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'corpus');

export const EVAL_USERS = {
  admin: { email: 'admin@opex.local', password: 'opex-dev-password' },
  confidential: { email: 'employee.confidential@opex.local', password: 'opex-dev-password' },
  internal: { email: 'employee.internal@opex.local', password: 'opex-dev-password' },
  public: { email: 'employee.public@opex.local', password: 'opex-dev-password' },
} as const;

const CORPUS_MIME: Record<string, string> = {
  'pump-manual.pdf': 'application/pdf',
  'scanned-inspection-report.pdf': 'application/pdf',
  'pid-diagram.pdf': 'application/pdf',
  'downtime.csv': 'text/csv',
  'hindi-safety-circular.pdf': 'application/pdf',
  'restricted-design-doc.pdf': 'application/pdf',
};

// Restricted, others default to the project's classification (1, Internal).
const CORPUS_CLASSIFICATION: Record<string, number> = {
  'restricted-design-doc.pdf': 3,
};

export interface CorpusSetup {
  baseUrl: string;
  adminClient: ApiClient;
  projectId: string;
  documentIdByFilename: Record<string, string>;
}

async function uploadFile(
  baseUrl: string,
  cookie: string,
  csrfToken: string,
  projectId: string,
  filename: string,
  classification?: number,
): Promise<{ id: string; status: string }> {
  const bytes = await readFile(path.join(CORPUS_DIR, filename));
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: CORPUS_MIME[filename] }), filename);
  if (classification !== undefined) form.append('classification', String(classification));

  const res = await fetch(`${baseUrl}/projects/${projectId}/documents`, {
    method: 'POST',
    headers: { cookie, 'x-csrf-token': csrfToken },
    body: form,
  });
  if (!res.ok) throw new Error(`upload of ${filename} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string; status: string };
}

async function waitForReady(client: ApiClient, documentId: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const doc = await client.get<{ status: string }>(`/documents/${documentId}`);
    if (doc.status === 'ready' || doc.status === 'failed') return doc.status;
    if (Date.now() > deadline) return doc.status;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

/**
 * Logs in as admin, uploads the full eval corpus into the seeded default
 * project, and waits for ingestion. Reuses documents already uploaded
 * (dedupe-by-sha256 makes this idempotent across runs).
 */
export async function setupCorpus(
  baseUrl: string,
  opts: { waitForIngestion?: boolean; timeoutMs?: number } = {},
): Promise<CorpusSetup> {
  const adminClient = new ApiClient(baseUrl);
  await adminClient.login(EVAL_USERS.admin);

  const projects = await adminClient.get<Array<{ id: string; name: string }>>('/projects');
  const project = projects.find((p) => p.name === 'Default Project') ?? projects[0];
  if (!project) throw new Error('no project found — run pnpm seed first');

  // Re-login to capture the raw cookie/csrf for the multipart upload helper
  // (ApiClient doesn't expose its internals, so we re-derive them here).
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(EVAL_USERS.admin),
  });
  const cookie = loginRes.headers.get('set-cookie')!.split(';')[0]!;
  const csrfToken = ((await loginRes.json()) as { csrfToken: string }).csrfToken;

  const files = (await readdir(CORPUS_DIR)).filter((f) => Object.hasOwn(CORPUS_MIME, f));
  const documentIdByFilename: Record<string, string> = {};

  for (const filename of files) {
    const doc = await uploadFile(baseUrl, cookie, csrfToken, project.id, filename, CORPUS_CLASSIFICATION[filename]);
    documentIdByFilename[filename] = doc.id;
  }

  if (opts.waitForIngestion) {
    for (const [filename, documentId] of Object.entries(documentIdByFilename)) {
      const status = await waitForReady(adminClient, documentId, opts.timeoutMs ?? 10 * 60 * 1000);
      if (status !== 'ready') {
        console.error(`WARNING: ${filename} ended in status "${status}", not "ready"`);
      }
    }
  }

  return { baseUrl, adminClient, projectId: project.id, documentIdByFilename };
}
