import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { requireAuth } from './auth.middleware';
import { ApiError } from '../types/api';

const { isSupabaseConfigured, createAnonVerificationClient } = vi.hoisted(() => ({
  isSupabaseConfigured: vi.fn(),
  createAnonVerificationClient: vi.fn(),
}));

vi.mock('../integrations/supabase/client', () => ({
  isSupabaseConfigured,
  createAnonVerificationClient,
}));

function makeRequest(authorization?: string): Request {
  return { headers: { authorization } } as unknown as Request;
}

function firstCallArg(fn: ReturnType<typeof vi.fn>): ApiError {
  const call = fn.mock.calls[0];
  if (!call) throw new Error('expected next() to have been called');
  return call[0] as ApiError;
}

describe('requireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseConfigured.mockReturnValue(true);
  });

  it('returns 503 when Supabase is not configured', async () => {
    isSupabaseConfigured.mockReturnValue(false);
    const next = vi.fn();

    await requireAuth(makeRequest('Bearer token'), {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503, code: 'auth_not_configured' }));
  });

  it('rejects a missing Authorization header with 401', async () => {
    const next = vi.fn();

    await requireAuth(makeRequest(undefined), {} as Response, next);

    const err = firstCallArg(next);
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('missing_token');
  });

  it('rejects a malformed Authorization header with 401', async () => {
    const next = vi.fn();

    await requireAuth(makeRequest('Basic abc123'), {} as Response, next);

    const err = firstCallArg(next);
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('missing_token');
  });

  it('rejects an invalid/expired token with 401 and never sets req.auth', async () => {
    createAnonVerificationClient.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } }) },
    });
    const next = vi.fn();
    const req = makeRequest('Bearer bad-token');

    await requireAuth(req, {} as Response, next);

    const err = firstCallArg(next);
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('invalid_token');
    expect(req.auth).toBeUndefined();
  });

  it('attaches verified identity and calls next() with no error on a valid token', async () => {
    createAnonVerificationClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-123', is_anonymous: true } },
          error: null,
        }),
      },
    });
    const next = vi.fn();
    const req = makeRequest('Bearer good-token');

    await requireAuth(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toEqual({ userId: 'user-123', isAnonymous: true, accessToken: 'good-token' });
  });
});
