// Tiny helper for fetch-models.sh: prints one TSV line per manifest entry
// (id, gguf_path, source_url, sha256); a model with an mmproj projector also
// gets a second line for that file so the shell script has a single
// source of truth (infra/models/manifest.yaml) instead of a duplicated list.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = process.env.MANIFEST_PATH ?? path.join(repoRoot, 'infra/models/manifest.yaml');

const doc = yaml.load(readFileSync(manifestPath, 'utf8'));
for (const entry of doc.models) {
  if (entry.enabled === false) continue;
  console.log([entry.id, entry.gguf_path, entry.source_url ?? '', entry.sha256 ?? ''].join('\t'));
  if (entry.mmproj_path) {
    console.log([`${entry.id}-mmproj`, entry.mmproj_path, entry.mmproj_source_url ?? '', entry.mmproj_sha256 ?? ''].join('\t'));
  }
}
