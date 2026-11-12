import type { Request, Response } from 'express';
import type { MeResponse } from '@tattva/contracts';
import { ApiError } from '../types/api';

/**
 * GET /api/v1/me (docs/API_CONTRACTS.md). Echoes only the verified identity
 * the auth middleware attached — never a client-supplied value.
 */
export function getMe(req: Request, res: Response<MeResponse>): void {
  if (!req.auth) {
    throw new ApiError(401, 'missing_token', 'Authentication required');
  }

  res.status(200).json({
    data: {
      user: { id: req.auth.userId, isAnonymous: req.auth.isAnonymous },
    },
  });
}
