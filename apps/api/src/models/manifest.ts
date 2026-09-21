import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { models } from '../db/schema/index.js';

export const manifestEntrySchema = z.object({
  id: z.string(),
  role: z.enum(['router', 'general', 'coder', 'vision', 'embed', 'rerank']),
  endpoint: z.string().url(),
  gguf_path: z.string(),
  mmproj_path: z.string().optional(),
  sha256: z.string().length(64),
  ctx_len: z.number().int().positive(),
  capabilities: z.array(z.enum(['tools', 'vision', 'json_schema'])).default([]),
  vram_mb: z.number().int().positive().optional(),
  license: z.string(),
  origin: z.string(),
  enabled: z.boolean().default(true),
});
export type ManifestEntry = z.infer<typeof manifestEntrySchema>;

const manifestSchema = z.object({
  models: z.array(manifestEntrySchema),
});

export class ManifestHashMismatchError extends Error {
  constructor(
    public readonly modelId: string,
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(`Model "${modelId}" SHA-256 mismatch: expected ${expected}, got ${actual}`);
    this.name = 'ManifestHashMismatchError';
  }
}

function sha256OfFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export async function loadManifest(manifestPath: string): Promise<ManifestEntry[]> {
  const raw = await readFile(manifestPath, 'utf8');
  const parsed = manifestSchema.parse(yaml.load(raw));
  return parsed.models;
}

export interface VerifyAndLoadOptions {
  manifestPath: string;
  modelsDir: string;
  /** Only verify hashes; do not write to the DB. Used by scripts/manifest-check.ts. */
  checkOnly?: boolean;
  db?: Db;
}

/**
 * Verifies every enabled manifest entry's file against its declared SHA-256
 * (invariant #3) and, unless checkOnly, upserts each into the `models` table.
 * Throws ManifestHashMismatchError on any mismatch — callers should treat this
 * as a boot-time refusal to start, not a warning.
 */
export async function verifyAndLoadManifest(opts: VerifyAndLoadOptions): Promise<ManifestEntry[]> {
  const entries = await loadManifest(opts.manifestPath);
  const enabled = entries.filter((e) => e.enabled);

  for (const entry of enabled) {
    const filePath = path.join(opts.modelsDir, entry.gguf_path);
    const actual = await sha256OfFile(filePath);
    if (actual !== entry.sha256) {
      throw new ManifestHashMismatchError(entry.id, entry.sha256, actual);
    }
  }

  if (!opts.checkOnly && opts.db) {
    for (const entry of enabled) {
      await opts.db
        .insert(models)
        .values({
          id: entry.id,
          role: entry.role,
          endpoint: entry.endpoint,
          ggufPath: entry.gguf_path,
          mmprojPath: entry.mmproj_path,
          sha256: entry.sha256,
          ctxLen: entry.ctx_len,
          capabilities: entry.capabilities,
          vramMb: entry.vram_mb,
          license: entry.license,
          origin: entry.origin,
          enabled: entry.enabled,
        })
        .onConflictDoUpdate({
          target: models.id,
          set: {
            role: entry.role,
            endpoint: entry.endpoint,
            ggufPath: entry.gguf_path,
            mmprojPath: entry.mmproj_path,
            sha256: entry.sha256,
            ctxLen: entry.ctx_len,
            capabilities: entry.capabilities,
            vramMb: entry.vram_mb,
            license: entry.license,
            origin: entry.origin,
            enabled: entry.enabled,
            updatedAt: new Date(),
          },
        });
    }
  }

  return enabled;
}
