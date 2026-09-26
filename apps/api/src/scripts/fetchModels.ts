/**
 * Setup step (runs in Docker, see RUNNER.md): downloads every model file the
 * manifest lists that is not present yet, resumably, and verifies each file's
 * pinned SHA-256 before leaving it in place (invariant 3). Needs internet, so
 * it only runs under the compose `setup` profile — never as a runtime service.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, statfs } from 'node:fs/promises';
import path from 'node:path';
import { loadDownloads, loadManifest, type ManifestDownload } from '../models/manifest.js';

export interface DownloadItem {
  name: string;
  file: string;
  url: string;
  sha256: string;
}

/** One item per distinct file (router/vision aliases share the chat model's files). Disabled and external entries are skipped. */
export function planDownloads(
  entries: Awaited<ReturnType<typeof loadManifest>>,
  extras: ManifestDownload[] = [],
): { items: DownloadItem[]; missingUrl: string[] } {
  const items: DownloadItem[] = [];
  const missingUrl: string[] = [];
  const seen = new Set<string>();
  const add = (name: string, file: string | undefined, url: string | undefined, sha256: string | undefined) => {
    if (!file || seen.has(file)) return;
    seen.add(file);
    if (!url || !sha256) {
      missingUrl.push(file);
      return;
    }
    items.push({ name, file, url, sha256 });
  };
  for (const e of entries) {
    if (!e.enabled || e.external) continue;
    add(e.id, e.gguf_path, e.source_url, e.sha256);
    add(`${e.id}-mmproj`, e.mmproj_path, e.mmproj_source_url, e.mmproj_sha256);
  }
  for (const d of extras) add(d.name, d.file, d.url, d.sha256);
  return { items, missingUrl };
}

export function sha256OfFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(file);
    stream.on('data', (c) => hash.update(c));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export interface DownloadOptions {
  attempts?: number;
  retryDelayMs?: number;
  onProgress?: (bytes: number, total: number | null) => void;
}

/** Downloads `url` to `dest` through `dest.part`, resuming with HTTP Range after any interruption. */
export async function downloadWithResume(url: string, dest: string, opts: DownloadOptions = {}): Promise<void> {
  const attempts = opts.attempts ?? 30;
  const part = `${dest}.part`;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const offset = await stat(part).then((s) => s.size).catch(() => 0);
      const res = await fetch(url, { headers: offset > 0 ? { range: `bytes=${offset}-` } : {}, redirect: 'follow' });
      if (res.status === 416) break; // the part file already holds the whole file
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const resumed = res.status === 206 && offset > 0;
      const length = Number(res.headers.get('content-length') ?? '0');
      const total = length > 0 ? length + (resumed ? offset : 0) : null;
      const out = createWriteStream(part, { flags: resumed ? 'a' : 'w' });
      let written = resumed ? offset : 0;
      const reader = res.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()));
          written += value.length;
          opts.onProgress?.(written, total);
        }
      } finally {
        await new Promise<void>((r) => out.end(() => r()));
      }
      if (total !== null && written < total) throw new Error(`connection closed at ${written} of ${total} bytes`);
      break;
    } catch (err) {
      if (attempt === attempts) throw new Error(`download failed after ${attempts} attempts: ${err instanceof Error ? err.message : String(err)}`);
      await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? Math.min(2000 * attempt, 15000)));
    }
  }
  await rename(part, dest);
}

const GB = 1024 ** 3;

async function preflight(modelsDir: string, neededBytes: number): Promise<void> {
  const fsStat = await statfs(modelsDir);
  const freeBytes = fsStat.bavail * fsStat.bsize;
  if (freeBytes < neededBytes) {
    console.warn(`WARNING: only ${(freeBytes / GB).toFixed(1)} GB free for models; about ${(neededBytes / GB).toFixed(1)} GB still to download.`);
  }
  const meminfo = await readFile('/proc/meminfo', 'utf8').catch(() => '');
  const kb = Number(/MemTotal:\s+(\d+)/.exec(meminfo)?.[1] ?? 0);
  if (kb > 0 && kb * 1024 < 9.5 * GB) {
    console.warn(
      `WARNING: Docker has ${((kb * 1024) / GB).toFixed(1)} GB of memory. The chat model needs about 10 GB — raise it in Docker Desktop (Settings > Resources) or WSL2's .wslconfig, or the model container will be killed.`,
    );
  }
}

async function main() {
  const modelsDir = process.env.MODELS_DIR ?? './models';
  const manifestPath = process.env.MANIFEST_PATH ?? './infra/models/manifest.yaml';
  await mkdir(modelsDir, { recursive: true });
  const { items, missingUrl } = planDownloads(await loadManifest(manifestPath), await loadDownloads(manifestPath));
  for (const f of missingUrl) console.warn(`[skip] ${f}: no source_url/sha256 in the manifest — provide the file manually.`);

  const todo: DownloadItem[] = [];
  for (const item of items) {
    const dest = path.join(modelsDir, item.file);
    const present = await stat(dest).then(() => true).catch(() => false);
    if (present) {
      const actual = await sha256OfFile(dest);
      if (actual === item.sha256) {
        console.log(`[${item.name}] already present and verified`);
        continue;
      }
      console.warn(`[${item.name}] present but the SHA-256 does not match the manifest; downloading it again`);
      await rm(dest);
    }
    todo.push(item);
  }
  if (todo.length > 0) await preflight(modelsDir, 6.5 * GB);

  for (const item of todo) {
    const dest = path.join(modelsDir, item.file);
    console.log(`[${item.name}] downloading ${item.url}`);
    let lastLog = 0;
    await downloadWithResume(item.url, dest, {
      onProgress: (bytes, total) => {
        const now = Date.now();
        if (now - lastLog < 3000) return;
        lastLog = now;
        const pct = total ? ` (${Math.floor((bytes / total) * 100)}%)` : '';
        console.log(`[${item.name}] ${(bytes / 1024 ** 2).toFixed(0)} MB${pct}`);
      },
    });
    const actual = await sha256OfFile(dest);
    if (actual !== item.sha256) {
      await rm(dest, { force: true });
      throw new Error(`[${item.name}] SHA-256 mismatch: manifest ${item.sha256}, downloaded ${actual}. File removed (invariant 3).`);
    }
    console.log(`[${item.name}] verified`);
  }
  console.log('\nAll model files are present and verified.');
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
