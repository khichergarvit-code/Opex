import 'dotenv/config';
import { createApp } from './app.js';
import { createDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { loadEnv } from './env.js';
import { verifyAndLoadManifest } from './models/manifest.js';
import { ModelGateway } from './models/gateway.js';
import { createDbSpanWriter } from './spans/writeSpan.js';
import { startMemoryScheduler } from './memory/scheduler.js';

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

  // B2: extraction from idle conversations + nightly TTL purge, in-process
  // (see memory/scheduler.ts's doc comment for why this isn't a new
  // worker container).
  const spanWriter = createDbSpanWriter(db);
  const gateway = new ModelGateway({ db, spanWriter });
  startMemoryScheduler(db, gateway, spanWriter);
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
