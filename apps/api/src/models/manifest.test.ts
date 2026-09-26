import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ManifestHashMismatchError, verifyAndLoadManifest } from './manifest.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'opex-manifest-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writeFixture(dir: string, content: string) {
  const modelsDir = path.join(dir, 'models');
  await mkdir(modelsDir, { recursive: true });
  const ggufPath = path.join(modelsDir, 'tiny.gguf');
  await writeFile(ggufPath, content);
  const sha256 = createHash('sha256').update(content).digest('hex');

  const manifest = {
    models: [
      {
        id: 'test-model',
        role: 'router',
        endpoint: 'http://localhost:8081',
        gguf_path: 'tiny.gguf',
        sha256,
        ctx_len: 4096,
        capabilities: ['json_schema'],
        vram_mb: 100,
        license: 'apache-2.0',
        origin: 'test',
        enabled: true,
      },
    ],
  };
  const manifestPath = path.join(dir, 'manifest.yaml');
  const yamlText = [
    'models:',
    '  - id: test-model',
    '    role: router',
    '    endpoint: http://localhost:8081',
    '    gguf_path: tiny.gguf',
    `    sha256: ${sha256}`,
    '    ctx_len: 4096',
    '    capabilities: [json_schema]',
    '    vram_mb: 100',
    '    license: apache-2.0',
    '    origin: test',
    '    enabled: true',
    '',
  ].join('\n');
  await writeFile(manifestPath, yamlText);
  return { manifestPath, modelsDir, manifest };
}

describe('verifyAndLoadManifest', () => {
  it('passes when the file hash matches the manifest', async () => {
    const { manifestPath, modelsDir } = await writeFixture(dir, 'hello world');
    const entries = await verifyAndLoadManifest({ manifestPath, modelsDir, checkOnly: true });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe('test-model');
  });

  it('throws ManifestHashMismatchError when the file has been tampered with', async () => {
    const { manifestPath, modelsDir } = await writeFixture(dir, 'hello world');
    await writeFile(path.join(modelsDir, 'tiny.gguf'), 'tampered content');
    await expect(
      verifyAndLoadManifest({ manifestPath, modelsDir, checkOnly: true }),
    ).rejects.toBeInstanceOf(ManifestHashMismatchError);
  });

  it('throws when the file is missing entirely', async () => {
    const { manifestPath, modelsDir } = await writeFixture(dir, 'hello world');
    await rm(path.join(modelsDir, 'tiny.gguf'));
    await expect(
      verifyAndLoadManifest({ manifestPath, modelsDir, checkOnly: true }),
    ).rejects.toThrow();
  });

  it('verifies the mmproj projector file too, and refuses a tampered one', async () => {
    const modelsDir = path.join(dir, 'models');
    await mkdir(modelsDir, { recursive: true });
    await writeFile(path.join(modelsDir, 'vl.gguf'), 'weights');
    await writeFile(path.join(modelsDir, 'vl-mmproj.gguf'), 'projector');
    const sha = (t: string) => createHash('sha256').update(t).digest('hex');
    const write = (mmprojSha: string) =>
      writeFile(
        path.join(dir, 'vision.yaml'),
        [
          'models:',
          '  - id: test-vision',
          '    role: vision',
          '    endpoint: http://localhost:8085',
          '    gguf_path: vl.gguf',
          `    sha256: ${sha('weights')}`,
          '    mmproj_path: vl-mmproj.gguf',
          `    mmproj_sha256: ${mmprojSha}`,
          '    ctx_len: 4096',
          '    capabilities: [vision]',
          '    license: apache-2.0',
          '    origin: test',
          '    enabled: true',
          '',
        ].join('\n'),
      );

    await write(sha('projector'));
    await expect(
      verifyAndLoadManifest({ manifestPath: path.join(dir, 'vision.yaml'), modelsDir, checkOnly: true }),
    ).resolves.toHaveLength(1);

    await write(sha('something else'));
    await expect(
      verifyAndLoadManifest({ manifestPath: path.join(dir, 'vision.yaml'), modelsDir, checkOnly: true }),
    ).rejects.toBeInstanceOf(ManifestHashMismatchError);
  });
});

import { assertInternalHost, resolveEndpoint } from './manifest.js';

describe('endpoint resolution from .env', () => {
  it('uses the default and stays local when the variable is unset', () => {
    expect(resolveEndpoint('${LLM_MAIN_URL:-http://llm-main:8082}', {})).toEqual({ url: 'http://llm-main:8082', external: false });
  });
  it('treats an override as external', () => {
    expect(resolveEndpoint('${LLM_MAIN_URL:-http://llm-main:8082}', { LLM_MAIN_URL: 'http://10.0.0.5:9000/' })).toEqual({
      url: 'http://10.0.0.5:9000',
      external: true,
    });
  });
  it('is not external when the override equals the default', () => {
    expect(resolveEndpoint('${LLM_MAIN_URL:-http://llm-main:8082}', { LLM_MAIN_URL: 'http://llm-main:8082' }).external).toBe(false);
  });
  it('passes literal endpoints through', () => {
    expect(resolveEndpoint('http://llm-embed:8083', {})).toEqual({ url: 'http://llm-embed:8083', external: false });
  });
});

describe('assertInternalHost', () => {
  it.each(['http://llm-main:8082', 'http://localhost:1', 'http://10.1.2.3', 'http://192.168.1.9:80', 'http://172.20.0.4', 'http://gpu.internal:8000', 'http://host.docker.internal:8082'])(
    'accepts %s',
    (u) => expect(() => assertInternalHost(u)).not.toThrow(),
  );
  it.each(['https://example.com', 'http://8.8.8.8', 'http://172.32.0.1', 'http://api.openai.com/v1'])('rejects %s', (u) =>
    expect(() => assertInternalHost(u)).toThrow(/internal host/),
  );
});

describe('model tiers and context override', () => {
  const yaml = (tier: string) => `models:
  - id: llm-main-${tier}
    role: general
    endpoint: http://llm-main:8082
    tier: ${tier}
    gguf_path: a.gguf
    sha256: "${'0'.repeat(64)}"
    ctx_len: 8192
    license: l
    origin: o
`;
  it('enables only the entries of the chosen tier (default small)', async () => {
    const { loadManifest } = await import('./manifest.js');
    const small = path.join(dir, 's.yaml');
    const standard = path.join(dir, 'st.yaml');
    await writeFile(small, yaml('small'));
    await writeFile(standard, yaml('standard'));
    expect((await loadManifest(small, {}))[0]!.enabled).toBe(true);
    expect((await loadManifest(standard, {}))[0]!.enabled).toBe(false);
    expect((await loadManifest(standard, { LLM_TIER: 'standard' }))[0]!.enabled).toBe(true);
  });
  it('LLM_CTX_LEN overrides the context the API budgets against, for chat roles only', async () => {
    const { loadManifest } = await import('./manifest.js');
    const f = path.join(dir, 's.yaml');
    await writeFile(f, yaml('small'));
    expect((await loadManifest(f, { LLM_CTX_LEN: '4096' }))[0]!.ctx_len).toBe(4096);
    expect((await loadManifest(f, { LLM_CTX_LEN: 'abc' }))[0]!.ctx_len).toBe(8192);
  });
});

describe('enabled_if_env', () => {
  it('enables an otherwise disabled optional model when its URL is set', async () => {
    const { loadManifest } = await import('./manifest.js');
    const file = path.join(dir, 'm.yaml');
    await writeFile(
      file,
      `models:
  - id: llm-rerank
    role: rerank
    endpoint: "\${LLM_RERANK_URL:-http://llm-rerank:8084}"
    gguf_path: r.gguf
    sha256: "${'0'.repeat(64)}"
    ctx_len: 8192
    license: mit
    origin: x
    enabled: false
    enabled_if_env: LLM_RERANK_URL
`,
    );
    expect((await loadManifest(file, {}))[0]!.enabled).toBe(false);
    const on = (await loadManifest(file, { LLM_RERANK_URL: 'http://10.0.0.9:8084' }))[0]!;
    expect(on.enabled).toBe(true);
    expect(on.external).toBe(true);
  });
});

describe('missing model files', () => {
  it('tell the user how to download them instead of failing with a raw ENOENT', async () => {
    const file = path.join(dir, 'm.yaml');
    await writeFile(
      file,
      `models:
  - id: llm-main
    role: general
    endpoint: http://llm-main:8082
    gguf_path: not-downloaded.gguf
    sha256: "${'0'.repeat(64)}"
    ctx_len: 1
    license: l
    origin: o
`,
    );
    await expect(verifyAndLoadManifest({ manifestPath: file, modelsDir: dir, checkOnly: true, env: {} })).rejects.toThrow(/model-fetch/);
  });
});
