import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { ApiError } from '../types/api';

const { isSupabaseConfigured, createAnonVerificationClient } = vi.hoisted(() => ({
  isSupabaseConfigured: vi.fn().mockReturnValue(true),
  createAnonVerificationClient: vi.fn(),
}));
const { createInquiryForUser, listInquiries, getInquiryDetail } = vi.hoisted(() => ({
  createInquiryForUser: vi.fn(),
  listInquiries: vi.fn(),
  getInquiryDetail: vi.fn(),
}));

vi.mock('../integrations/supabase/client', () => ({
  isSupabaseConfigured,
  createAnonVerificationClient,
  createRequestScopedClient: vi.fn(),
}));
vi.mock('../services/inquiryService', () => ({ createInquiryForUser, listInquiries, getInquiryDetail }));

import { createApp } from '../app';

const VERIFIED_USER = { id: 'a0a0a0a0-0000-4000-8000-000000000001', is_anonymous: true };

function authorizedGetUser() {
  createAnonVerificationClient.mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: VERIFIED_USER }, error: null }) },
  });
}

describe('API authentication (docs/API_CONTRACTS.md §0)', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseConfigured.mockReturnValue(true);
  });

  it('GET /api/v1/me rejects a missing token with 401', async () => {
    const res = await request(app).get('/api/v1/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('missing_token');
  });

  it('GET /api/v1/me returns the verified identity for a valid token', async () => {
    authorizedGetUser();

    const res = await request(app).get('/api/v1/me').set('Authorization', 'Bearer good-token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { user: { id: VERIFIED_USER.id, isAnonymous: true } } });
  });
});

describe('POST /api/v1/inquiries', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseConfigured.mockReturnValue(true);
    authorizedGetUser();
  });

  it('rejects a malformed body with 400', async () => {
    const res = await request(app)
      .post('/api/v1/inquiries')
      .set('Authorization', 'Bearer good-token')
      .send({ learningSourceId: 'not-a-uuid' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(createInquiryForUser).not.toHaveBeenCalled();
  });

  it('creates the inquiry for a valid request', async () => {
    const sourceId = 'b0b0b0b0-0000-4000-8000-000000000002';
    createInquiryForUser.mockResolvedValue({
      id: 'inq-1',
      userId: VERIFIED_USER.id,
      learningSourceId: sourceId,
      title: null,
      createdAt: 'now',
      updatedAt: 'now',
    });

    const res = await request(app)
      .post('/api/v1/inquiries')
      .set('Authorization', 'Bearer good-token')
      .send({ learningSourceId: sourceId });

    expect(res.status).toBe(201);
    expect(res.body.data.userId).toBe(VERIFIED_USER.id);
    expect(createInquiryForUser).toHaveBeenCalledWith('good-token', VERIFIED_USER.id, sourceId);
  });
});

describe('GET /api/v1/inquiries/:inquiryId', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseConfigured.mockReturnValue(true);
    authorizedGetUser();
  });

  it('returns 404 when the service reports the inquiry is not found/not owned', async () => {
    getInquiryDetail.mockRejectedValue(new ApiError(404, 'inquiry_not_found', 'Inquiry not found'));

    const res = await request(app)
      .get('/api/v1/inquiries/c0c0c0c0-0000-4000-8000-000000000003')
      .set('Authorization', 'Bearer good-token');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('inquiry_not_found');
  });

  it('rejects a malformed inquiry id with 400', async () => {
    const res = await request(app)
      .get('/api/v1/inquiries/not-a-uuid')
      .set('Authorization', 'Bearer good-token');

    expect(res.status).toBe(400);
    expect(getInquiryDetail).not.toHaveBeenCalled();
  });
});
