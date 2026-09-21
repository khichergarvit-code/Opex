/**
 * Standalone manifest hash check — run before `make up` / at any time to
 * verify every enabled model file's SHA-256 matches infra/models/manifest.yaml
 * (invariant #3), without needing Postgres up. Shares verifyAndLoadManifest
 * with the API's boot-time check so the two never drift.
 *
 * Run: tsx scripts/manifest-check.ts
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyAndLoadManifest } from '../apps/api/src/models/manifest.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '..');

async function main() {
  const manifestPath = process.env.MANIFEST_PATH ?? path.join(repoRoot, 'infra/models/manifest.yaml');
  const modelsDir = process.env.MODELS_DIR ?? path.join(repoRoot, 'models');

  const entries = await verifyAndLoadManifest({ manifestPath, modelsDir, checkOnly: true });
  console.log(`OK — ${entries.length} enabled model(s) match their manifest SHA-256.`);
  for (const e of entries) {
    console.log(`  ${e.id} (${e.role}) — ${e.gguf_path}`);
  }
}

main().catch((err) => {
  console.error('Manifest check FAILED:', err.message ?? err);
  process.exit(1);
});
