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
