import 'dotenv/config';
import { createApp } from './app.js';
import { createDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { loadEnv } from './env.js';
import { verifyAndLoadManifest } from './models/manifest.js';

async function main() {
  const env = loadEnv();
  const db = createDb(env);

  await runMigrations(env);

  // Refuses to boot on a manifest/file SHA-256 mismatch (invariant #3).
  await verifyAndLoadManifest({
    manifestPath: env.MANIFEST_PATH,
    modelsDir: env.MODELS_DIR,
    db,
  });

  const app = createApp(db, env);
  app.listen(env.PORT, () => {
    console.log(`OpeX API listening on :${env.PORT}`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
