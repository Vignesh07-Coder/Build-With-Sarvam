import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../types/api';
import { createAnonVerificationClient, isSupabaseConfigured } from '../integrations/supabase/client';

/**
 * Authentication middleware (docs/ARCHITECTURE.md §6.1, ADR-002).
 *
 * Extracts the bearer token, verifies it against Supabase Auth, and attaches
 * `{ userId, isAnonymous, accessToken }` to the request. Rejects before any
 * route handler/service/repository runs. Never accepts a client-supplied
 * user ID as authoritative.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!isSupabaseConfigured()) {
    next(
      new ApiError(
        503,
        'auth_not_configured',
        'Supabase authentication is not configured on this server',
      ),
    );
    return;
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(new ApiError(401, 'missing_token', 'Missing or malformed Authorization header'));
    return;
  }

  const accessToken = header.slice('Bearer '.length).trim();
  if (!accessToken) {
    next(new ApiError(401, 'missing_token', 'Missing bearer token'));
    return;
  }

  try {
    const client = createAnonVerificationClient();
    const { data, error } = await client.auth.getUser(accessToken);

    if (error || !data.user) {
      next(new ApiError(401, 'invalid_token', 'Invalid or expired access token'));
      return;
    }

    req.auth = {
      userId: data.user.id,
      isAnonymous: data.user.is_anonymous ?? false,
      accessToken,
    };
    next();
  } catch (cause) {
    next(new ApiError(401, 'invalid_token', 'Could not verify access token', { cause: String(cause) }));
  }
}
