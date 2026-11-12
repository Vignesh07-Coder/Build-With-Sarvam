import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/env';

/**
 * Supabase client construction (docs/ARCHITECTURE.md §6.3, ADR-002).
 *
 * Two distinct clients, matching the documented trust boundary:
 * - `isSupabaseConfigured` / `createRequestScopedClient`: built per-request
 *   using the caller's verified access token. Used for all ordinary,
 *   RLS-protected reads/writes (`inquiries`, `question_nodes`,
 *   `follow_up_questions`, `learning_sources`).
 * - `getAdminClient`: the privileged service-role client. Stage 5 does not
 *   yet use it from application code (no Stamina-ledger writes exist), but
 *   it is wired here so the Stamina service has a single, audited place to
 *   obtain it later rather than constructing its own client inline.
 *
 * Neither client is constructed at module load time off missing
 * credentials — callers must check `isSupabaseConfigured()` first and
 * surface a 503, per CLAUDE.md §5/§6 (optional integration credentials must
 * not crash the process, but also must never be silently treated as present).
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
}

export function createRequestScopedClient(accessToken: string): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error('Supabase is not configured: SUPABASE_URL/SUPABASE_ANON_KEY missing');
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * A client authenticated with the anon key only (no caller token), used
 * solely to verify a bearer token via `auth.getUser(token)` in the auth
 * middleware. Distinct from `createRequestScopedClient` to make clear this
 * instance is never used for data access.
 */
export function createAnonVerificationClient(): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error('Supabase is not configured: SUPABASE_URL/SUPABASE_ANON_KEY missing');
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let adminClient: SupabaseClient | null = null;

/**
 * The privileged service-role client (docs/ARCHITECTURE.md §6.3). Bypasses
 * RLS entirely — must only ever be used inside a trusted service method
 * that enforces authorization itself. Not called anywhere yet in Stage 5.
 */
export function getAdminClient(): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase is not configured: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing');
  }

  if (!adminClient) {
    adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return adminClient;
}
