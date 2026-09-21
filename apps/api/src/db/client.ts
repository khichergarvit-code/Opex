import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';
import type { Env } from '../env.js';

export function createDb(env: Pick<Env, 'DATABASE_URL'>) {
  const queryClient = postgres(env.DATABASE_URL);
  return drizzle(queryClient, { schema });
}

export type Db = ReturnType<typeof createDb>;
