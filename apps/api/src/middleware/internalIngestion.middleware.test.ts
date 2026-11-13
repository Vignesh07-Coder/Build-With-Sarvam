import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { requireInternalIngestionKey } from './internalIngestion.middleware';
import { ApiError } from '../types/api';

const { env } = vi.hoisted(() => ({ env: { INTERNAL_INGESTION_KEY: undefined as string | undefined } }));

vi.mock('../config/env', () => ({ env }));

function makeRequest(key?: string): Request {
  return { headers: { 'x-internal-ingestion-key': key } } as unknown as Request;
}

function firstCallArg(fn: ReturnType<typeof vi.fn>): ApiError {
  const call = fn.mock.calls[0];
  if (!call) throw new Error('expected next() to have been called');
  return call[0] as ApiError;
}

describe('requireInternalIngestionKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.INTERNAL_INGESTION_KEY = undefined;
  });

  it('returns 503 when no key is configured on the server', () => {
    const next = vi.fn();

    requireInternalIngestionKey(makeRequest('anything'), {} as Response, next);

    const err = firstCallArg(next);
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('ingestion_not_configured');
  });

  it('rejects a missing header with 403', () => {
    env.INTERNAL_INGESTION_KEY = 'secret-key';
    const next = vi.fn();

    requireInternalIngestionKey(makeRequest(undefined), {} as Response, next);

    const err = firstCallArg(next);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('ingestion_key_invalid');
  });

  it('rejects a mismatched key with 403', () => {
    env.INTERNAL_INGESTION_KEY = 'secret-key';
    const next = vi.fn();

    requireInternalIngestionKey(makeRequest('wrong-key'), {} as Response, next);

    const err = firstCallArg(next);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('ingestion_key_invalid');
  });

  it('calls next() with no error when the key matches', () => {
    env.INTERNAL_INGESTION_KEY = 'secret-key';
    const next = vi.fn();

    requireInternalIngestionKey(makeRequest('secret-key'), {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });
});
