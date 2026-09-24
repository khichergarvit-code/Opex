import 'dotenv/config';
import { createApp } from './app.js';
import { createDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { loadEnv } from './env.js';
import { verifyAndLoadManifest } from './models/manifest.js';
import { ModelGateway } from './models/gateway.js';
import { createDbAuditWriter } from './audit/writeAudit.js';
import { createDbSpanWriter } from './spans/writeSpan.js';
import { startMemoryScheduler } from './memory/scheduler.js';
import { recoverInterruptedTurns } from './orchestrator/recoverInterrupted.js';
import { startApprovalTimeoutSweep } from './orchestrator/approvalSweep.js';

async function main() {
  const env = loadEnv();
  const db = createDb(env);

  await runMigrations(env);

  // Refuses to boot on a manifest/file SHA-256 mismatch (invariant #3).
  await verifyAndLoadManifest({
    manifestPath: env.MANIFEST_PATH,
    modelsDir: env.MODELS_DIR,
    db,
    auditWriter: createDbAuditWriter(db),
  });

  const recovered = await recoverInterruptedTurns(db);
  if (recovered > 0) console.log(`Recovered ${recovered} chat(s) left without an answer by a restart.`);

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

  // B4: pending-past-timeout approvals count as denied (tools.md), same
  // in-process interval pattern as the memory scheduler above.
  startApprovalTimeoutSweep({
    db,
    gateway,
    spanWriter,
    sandboxRunnerUrl: env.SANDBOX_RUNNER_URL,
    sandboxSharedSecret: env.SANDBOX_SHARED_SECRET,
    dataDir: env.DATA_DIR,
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
