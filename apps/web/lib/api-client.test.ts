import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, getHealth } from './api-client';

describe('getHealth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the parsed payload on a valid response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', service: 'tattva-api' }),
      }),
    );

    await expect(getHealth()).resolves.toEqual({ status: 'ok', service: 'tattva-api' });
  });

  it('throws ApiClientError on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }),
    );

    await expect(getHealth()).rejects.toBeInstanceOf(ApiClientError);
  });

  it('throws ApiClientError when the payload fails schema validation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'nope' }) }),
    );

    await expect(getHealth()).rejects.toBeInstanceOf(ApiClientError);
  });
});
