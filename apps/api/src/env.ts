import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  MODELS_DIR: z.string().default('./models'),
  DATA_DIR: z.string().default('./data'),
  MANIFEST_PATH: z.string().default('./infra/models/manifest.yaml'),
  LLM_SMALL_URL: z.string().url().default('http://localhost:8081'),
  LLM_MAIN_URL: z.string().url().default('http://localhost:8082'),
  LLM_EMBED_URL: z.string().url().default('http://localhost:8083'),
  LLM_RERANK_URL: z.string().url().default('http://localhost:8084'),
  SANDBOX_RUNNER_URL: z.string().url().default('http://localhost:8085'),
  SANDBOX_SHARED_SECRET: z.string().min(1).default('dev_only_change_me'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration');
  }
  return parsed.data;
}
