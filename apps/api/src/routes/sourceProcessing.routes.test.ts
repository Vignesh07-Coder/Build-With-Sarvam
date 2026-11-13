import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import * as authMiddleware from '../middleware/auth.middleware';
import * as service from '../services/sourceProcessingService';
import * as supabaseClient from '../integrations/supabase/client';
import { ApiError } from '../types/api';

vi.mock('../middleware/auth.middleware');
vi.mock('../services/sourceProcessingService');
vi.mock('../integrations/supabase/client');

describe('POST /api/v1/sources/ingest', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock: auth passes
    vi.mocked(authMiddleware.requireAuth).mockImplementation(async (req, _res, next) => {
      req.auth = {
        userId: '11111111-1111-4111-8111-111111111111',
        isAnonymous: false,
        accessToken: 'fake-token',
      };
      next();
    });

    vi.mocked(supabaseClient.getAdminClient).mockReturnValue(
      {} as unknown as ReturnType<typeof supabaseClient.getAdminClient>,
    );
  });

  const validBody = {
    title: 'Compiler Construction: Lexing & Parsing',
    description: 'Context-free grammars, LR parsers, and AST generation.',
    sourceType: 'transcript',
    durationMinutes: 50,
    sourceReference: 'seed/compilers.txt',
    rawBody: 'Grammars define the syntactic structure of programming languages. '.repeat(5),
  };

  it('returns 201 Created on valid ingestion request', async () => {
    vi.mocked(service.ingestLearningSource).mockResolvedValueOnce({
      learningSourceId: '22222222-2222-4222-8222-222222222222',
      title: validBody.title,
      sourceType: 'transcript',
      durationMinutes: 50,
      sourceReference: validBody.sourceReference,
      content: {
        id: '33333333-3333-4333-8333-333333333333',
        learningSourceId: '22222222-2222-4222-8222-222222222222',
        contentHash: 'hash123',
        processingStatus: 'pending',
        processingError: null,
        processedAt: null,
        createdAt: '2026-11-13T00:00:00.000Z',
        updatedAt: '2026-11-13T00:00:00.000Z',
      },
    });

    const res = await request(app)
      .post('/api/v1/sources/ingest')
      .set('Authorization', 'Bearer fake-token')
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.data.learningSourceId).toBe('22222222-2222-4222-8222-222222222222');
    expect(res.body.data.content.processingStatus).toBe('pending');
  });

  it('forwards domain validation errors as 400', async () => {
    vi.mocked(service.ingestLearningSource).mockRejectedValueOnce(
      new ApiError(400, 'INVALID_SOURCE_INPUT', 'Duration must be at least 25 minutes'),
    );

    const res = await request(app)
      .post('/api/v1/sources/ingest')
      .set('Authorization', 'Bearer fake-token')
      .send({ ...validBody, durationMinutes: 10 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SOURCE_INPUT');
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(authMiddleware.requireAuth).mockImplementation(async (_req, res) => {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Missing token' },
      });
    });

    const res = await request(app)
      .post('/api/v1/sources/ingest')
      .send(validBody);

    expect(res.status).toBe(401);
  });
});
