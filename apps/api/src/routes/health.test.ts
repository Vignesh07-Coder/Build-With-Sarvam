import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';

describe('GET /health', () => {
  const app = createApp();

  it('returns 200 with the expected status/service payload', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'tattva-api' });
  });
});

describe('unknown routes', () => {
  const app = createApp();

  it('returns a structured 404 error envelope', async () => {
    const res = await request(app).get('/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});
