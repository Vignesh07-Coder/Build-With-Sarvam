import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { ApiError, type ApiErrorBody } from '../types/api';

/**
 * Centralized error handler, matching the error envelope in
 * docs/API_CONTRACTS.md §0. Never leaks stack traces or internal details to
 * the client (CLAUDE.md §5 / docs/ARCHITECTURE.md §6.11).
 */
export function errorHandler(err: unknown, _req: Request, res: Response<ApiErrorBody>, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'Request validation failed',
        details: err.flatten().fieldErrors,
      },
    });
    return;
  }

  logger.error({ err }, 'Unhandled error');

  res.status(500).json({
    error: {
      code: 'internal_error',
      message: env.NODE_ENV === 'production' ? 'Something went wrong' : String(err),
    },
  });
}
