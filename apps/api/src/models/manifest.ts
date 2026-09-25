import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { notInArray } from 'drizzle-orm';
import yaml from 'js-yaml';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { models } from '../db/schema/index.js';
import type { AuditWriter } from '../audit/writeAudit.js';

export const manifestEntrySchema = z.object({
  id: z.string(),
  role: z.enum(['router', 'general', 'coder', 'vision', 'embed', 'rerank']),
  /** May be `${ENV_VAR:-http://default:port}`; a value other than the default marks the model external. */
  endpoint: z.string(),
  gguf_path: z.string(),
  mmproj_path: z.string().optional(),
  /** Required whenever mmproj_path is set — the projector is model weights too (invariant #3). */
  mmproj_sha256: z.string().length(64).optional(),
  sha256: z.string().length(64),
  /** Where the setup step downloads the file from (not used at runtime). */
  source_url: z.string().url().optional(),
  mmproj_source_url: z.string().url().optional(),
  ctx_len: z.number().int().positive(),
  capabilities: z.array(z.enum(['tools', 'vision', 'json_schema'])).default([]),
  vram_mb: z.number().int().positive().optional(),
  license: z.string(),
  origin: z.string(),
  enabled: z.boolean().default(true),
  /** Turns a disabled entry on when this env var is set (so a URL in .env is all an optional model needs). */
  enabled_if_env: z.string().optional(),
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

export type ResolvedManifestEntry = ManifestEntry & {
  /** True when the endpoint was overridden through .env: served elsewhere, no local file/hash to verify. */
  external: boolean;
};

const ENV_ENDPOINT = /^\$\{([A-Z0-9_]+):-(.+)\}$/;

/** Resolves `${VAR:-default}` against env. Anything else is a literal, local endpoint. */
export function resolveEndpoint(endpoint: string, env: NodeJS.ProcessEnv): { url: string; external: boolean } {
  const m = ENV_ENDPOINT.exec(endpoint);
  if (!m) return { url: endpoint, external: false };
  const [, name, fallback] = m as unknown as [string, string, string];
  const override = env[name]?.trim();
  const url = (override || fallback).replace(/\/+$/, '');
  return { url, external: url !== fallback.replace(/\/+$/, '') };
}

/**
 * Externally served models are only accepted on internal hosts (a Docker
 * service name, localhost, or a private/LAN address) so the no-egress
 * invariants still hold: a public hostname or IP is refused.
 */
export function assertInternalHost(rawUrl: string): void {
  const url = new URL(rawUrl);
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  let internal: boolean;
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    internal = a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  } else if (host.includes(':')) {
    internal = host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80');
  } else {
    internal =
      !host.includes('.') ||
      ['.local', '.internal', '.lan', '.localdomain', '.home.arpa'].some((suffix) => host.endsWith(suffix));
  }
  if (!internal) {
    throw new Error(`Model endpoint ${url.origin} is not an internal host — external models must live on the private network (no runtime egress).`);
  }
}

export async function loadManifest(manifestPath: string, env: NodeJS.ProcessEnv = process.env): Promise<ResolvedManifestEntry[]> {
  const raw = await readFile(manifestPath, 'utf8');
  const parsed = manifestSchema.parse(yaml.load(raw));
  return parsed.models.map((entry) => {
    const { url, external } = resolveEndpoint(entry.endpoint, env);
    const enabled = entry.enabled || (entry.enabled_if_env ? Boolean(env[entry.enabled_if_env]?.trim()) : false);
    return { ...entry, enabled, endpoint: url, external };
  });
}

export interface VerifyAndLoadOptions {
  manifestPath: string;
  modelsDir: string;
  /** Only verify hashes; do not write to the DB. Used by scripts/manifest-check.ts. */
  checkOnly?: boolean;
  db?: Db;
  env?: NodeJS.ProcessEnv;
  auditWriter?: AuditWriter;
}

/**
 * Verifies every enabled manifest entry's file against its declared SHA-256
 * (invariant #3) and, unless checkOnly, upserts each into the `models` table.
 * Throws ManifestHashMismatchError on any mismatch — callers should treat this
 * as a boot-time refusal to start, not a warning.
 */
export async function verifyAndLoadManifest(opts: VerifyAndLoadOptions): Promise<ResolvedManifestEntry[]> {
  const entries = await loadManifest(opts.manifestPath, opts.env);
  const enabled = entries.filter((e) => e.enabled);

  // Alias entries (router/vision served by the same file as chat) share one hash computation.
  const hashCache = new Map<string, Promise<string>>();
  const hashOf = (file: string) => {
    let pending = hashCache.get(file);
    if (!pending) {
      pending = sha256OfFile(file).catch((err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          throw new Error(
            `Model file missing: ${file}. Download the models first: docker compose --profile setup run --rm model-fetch (see RUNNER.md).`,
          );
        }
        throw err;
      });
      hashCache.set(file, pending);
    }
    return pending;
  };

  for (const entry of enabled) {
    if (entry.external) {
      assertInternalHost(entry.endpoint);
      continue;
    }
    const filePath = path.join(opts.modelsDir, entry.gguf_path);
    const actual = await hashOf(filePath);
    if (actual !== entry.sha256) {
      throw new ManifestHashMismatchError(entry.id, entry.sha256, actual);
    }
    if (entry.mmproj_path) {
      if (!entry.mmproj_sha256) {
        throw new Error(`Model "${entry.id}" has mmproj_path but no mmproj_sha256`);
      }
      const mmprojActual = await hashOf(path.join(opts.modelsDir, entry.mmproj_path));
      if (mmprojActual !== entry.mmproj_sha256) {
        throw new ManifestHashMismatchError(`${entry.id} (mmproj)`, entry.mmproj_sha256, mmprojActual);
      }
    }
  }

  if (!opts.checkOnly && opts.db) {
    // Registry rows for models that are no longer in the manifest (or are disabled) must not
    // win a role lookup, e.g. a removed llm-small still claiming the router role.
    const enabledIds = enabled.map((e) => e.id);
    if (enabledIds.length > 0) {
      await opts.db.update(models).set({ enabled: false }).where(notInArray(models.id, enabledIds));
    }
    for (const entry of enabled) {
      const verified = !entry.external;
      const origin = entry.external ? `external: ${new URL(entry.endpoint).host}` : entry.origin;
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
          origin,
          verified,
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
            origin,
            verified,
            enabled: entry.enabled,
            updatedAt: new Date(),
          },
        });
      if (entry.external) {
        await opts.auditWriter?.writeAudit({
          actorId: null,
          action: 'model.external_registered',
          resource: entry.id,
          details: { endpoint: entry.endpoint, role: entry.role, verified: false },
        });
      }
    }
  }

  return enabled;
}
