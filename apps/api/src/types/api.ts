/**
 * Shared response envelope shapes for versioned /api/v1 routes, matching the
 * conventions in docs/API_CONTRACTS.md §0. (GET /health intentionally does
 * NOT use this envelope — see packages/contracts/src/health.ts.)
 */
export interface ApiSuccess<T> {
  data: T;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(statusCode: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
