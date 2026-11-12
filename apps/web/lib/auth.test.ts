import { afterEach, describe, expect, it, vi } from 'vitest';

const { isSupabaseConfigured, getSupabaseClient } = vi.hoisted(() => ({
  isSupabaseConfigured: vi.fn(),
  getSupabaseClient: vi.fn(),
}));

vi.mock('./supabase/client', () => ({ isSupabaseConfigured, getSupabaseClient }));

import { AuthNotConfiguredError, getAccessToken } from './auth';

describe('getAccessToken', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('throws AuthNotConfiguredError when Supabase env vars are missing', async () => {
    isSupabaseConfigured.mockReturnValue(false);

    await expect(getAccessToken()).rejects.toBeInstanceOf(AuthNotConfiguredError);
  });

  it('reuses an existing session without signing in again', async () => {
    isSupabaseConfigured.mockReturnValue(true);
    const signInAnonymously = vi.fn();
    getSupabaseClient.mockReturnValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'existing-token' } }, error: null }),
        signInAnonymously,
      },
    });

    await expect(getAccessToken()).resolves.toBe('existing-token');
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('signs in anonymously when no session exists and returns the new token', async () => {
    isSupabaseConfigured.mockReturnValue(true);
    getSupabaseClient.mockReturnValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        signInAnonymously: vi.fn().mockResolvedValue({ data: { session: { access_token: 'new-token' } }, error: null }),
      },
    });

    await expect(getAccessToken()).resolves.toBe('new-token');
  });
});
