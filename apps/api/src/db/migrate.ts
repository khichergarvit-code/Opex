import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Env } from '../env.js';
import { loadEnv } from '../env.js';

export async function runMigrations(env: Pick<Env, 'DATABASE_URL'>): Promise<void> {
  const migrationClient = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(migrationClient);
  await migrate(db, { migrationsFolder: new URL('./migrations', import.meta.url).pathname });
  await migrationClient.end();
}

async function main() {
  await runMigrations(loadEnv());
  console.log('Migrations applied.');
}

// Only run as a CLI entrypoint (`tsx src/db/migrate.ts` / `node dist/db/migrate.js`),
// not when imported by index.ts's boot sequence.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
