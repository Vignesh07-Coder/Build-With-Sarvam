import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser Supabase client (ADR-002). The anon key is intentionally public —
 * it is safe only because Supabase RLS enforces per-row access
 * (docs/DATABASE.md §10). Session persistence/auto-refresh uses the
 * Supabase JS client's default local-storage behavior; no custom store.
 */
let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY missing');
  }

  if (!client) {
    client = createClient(url, anonKey);
  }

  return client;
}
