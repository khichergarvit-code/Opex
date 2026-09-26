import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  MODELS_DIR: z.string().default('./models'),
  DATA_DIR: z.string().default('./data'),
  MANIFEST_PATH: z.string().default('./infra/models/manifest.yaml'),
  // Model endpoints are read from process.env by the manifest loader (`${LLM_<ROLE>_URL:-default}`);
  // listed here only so they are documented next to the other settings.
  LLM_MAIN_URL: z.string().optional(),
  LLM_ROUTER_URL: z.string().optional(),
  LLM_VISION_URL: z.string().optional(),
  LLM_EMBED_URL: z.string().optional(),
  LLM_RERANK_URL: z.string().optional(),
  LLM_IMAGE_URL: z.string().optional(),
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
