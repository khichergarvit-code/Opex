import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { downloadWithResume, planDownloads, sha256OfFile } from './fetchModels.js';

let dir: string;
let server: http.Server;
let url: string;
const payload = Buffer.from('0123456789'.repeat(5000));
let failFirst = true;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'opex-fetch-'));
  failFirst = true;
  server = http.createServer((req, res) => {
    const range = /bytes=(\d+)-/.exec(req.headers.range ?? '');
    const start = range ? Number(range[1]) : 0;
    const body = payload.subarray(start);
    if (range) res.writeHead(206, { 'content-length': body.length, 'content-range': `bytes ${start}-${payload.length - 1}/${payload.length}` });
    else res.writeHead(200, { 'content-length': payload.length });
    if (!range && failFirst) {
      // First attempt: send half the file, then drop the connection.
      failFirst = false;
      res.write(payload.subarray(0, 20000));
      setTimeout(() => res.destroy(), 20);
      return;
    }
    res.end(body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/model.gguf`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
});

describe('downloadWithResume', () => {
  it('resumes after the connection drops and produces the exact file', async () => {
    const dest = path.join(dir, 'model.gguf');
    await downloadWithResume(url, dest, { retryDelayMs: 5 });
    expect((await readFile(dest)).equals(payload)).toBe(true);
    expect(await sha256OfFile(dest)).toBe(createHash('sha256').update(payload).digest('hex'));
  });

  it('continues from an existing partial file', async () => {
    failFirst = false;
    const dest = path.join(dir, 'model.gguf');
    await writeFile(`${dest}.part`, payload.subarray(0, 12345));
    await downloadWithResume(url, dest);
    expect((await readFile(dest)).equals(payload)).toBe(true);
  });
});

describe('planDownloads', () => {
  const entry = (over: object) =>
    ({ id: 'x', role: 'general', endpoint: 'http://x', gguf_path: 'a.gguf', sha256: 'a'.repeat(64), ctx_len: 1, capabilities: [], license: 'l', origin: 'o', enabled: true, external: false, ...over }) as never;

  it('lists each file once, including the projector, across alias entries', () => {
    const shared = { gguf_path: 'vl.gguf', source_url: 'http://h/vl.gguf', mmproj_path: 'mm.gguf', mmproj_source_url: 'http://h/mm.gguf', mmproj_sha256: 'b'.repeat(64) };
    const { items } = planDownloads([entry({ id: 'main', ...shared }), entry({ id: 'router', ...shared }), entry({ id: 'vision', ...shared })]);
    expect(items.map((i) => i.file)).toEqual(['vl.gguf', 'mm.gguf']);
  });

  it('skips disabled and external entries and reports files without a source url', () => {
    const { items, missingUrl } = planDownloads([
      entry({ id: 'off', gguf_path: 'off.gguf', enabled: false, source_url: 'http://h/off' }),
      entry({ id: 'ext', gguf_path: 'ext.gguf', external: true, source_url: 'http://h/ext' }),
      entry({ id: 'nourl', gguf_path: 'nourl.gguf' }),
    ]);
    expect(items).toEqual([]);
    expect(missingUrl).toEqual(['nourl.gguf']);
  });
});
