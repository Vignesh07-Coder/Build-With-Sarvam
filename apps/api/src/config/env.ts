import { z } from 'zod';

/**
 * Server-side environment contract for apps/api.
 *
 * Required application configuration has safe local defaults so the server
 * can start without any external accounts configured (CLAUDE.md §5 / §6:
 * optional integration credentials must never block the basic health check).
 * Supabase/Sarvam credentials remain optional at the env-parsing level so
 * `/health` always starts; routes that actually need Supabase (auth
 * middleware, repositories) fail with a clear 503 at request time instead —
 * see apps/api/src/middleware/auth.middleware.ts.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),

  // Optional integrations (Pending real values — do not fabricate credentials).
  SARVAM_API_KEY: z.string().min(1).optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();
