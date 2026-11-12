import { getSupabaseClient, isSupabaseConfigured } from './supabase/client';

/**
 * Anonymous-session bootstrap (ADR-002). Establishes a Supabase Auth
 * session on first visit and reuses the persisted session afterward.
 * Returns the current access token for the frontend API client to attach
 * as `Authorization: Bearer <token>` — the backend independently verifies
 * it (ARCHITECTURE.md §6.1); this module never invents a user ID.
 */
export class AuthNotConfiguredError extends Error {
  constructor() {
    super('Supabase is not configured — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
    this.name = 'AuthNotConfiguredError';
  }
}

export async function getAccessToken(): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new AuthNotConfiguredError();
  }

  const supabase = getSupabaseClient();

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(`Failed to read Supabase session: ${sessionError.message}`);
  }

  if (sessionData.session) {
    return sessionData.session.access_token;
  }

  const { data: signInData, error: signInError } = await supabase.auth.signInAnonymously();
  if (signInError || !signInData.session) {
    throw new Error(`Failed to establish an anonymous session: ${signInError?.message ?? 'no session returned'}`);
  }

  return signInData.session.access_token;
}
