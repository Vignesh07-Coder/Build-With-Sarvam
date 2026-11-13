import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import * as authMiddleware from '../middleware/auth.middleware';
import * as internalIngestionMiddleware from '../middleware/internalIngestion.middleware';
import * as service from '../services/sourceProcessingService';
import * as supabaseClient from '../integrations/supabase/client';
import { ApiError } from '../types/api';

vi.mock('../middleware/auth.middleware');
vi.mock('../middleware/internalIngestion.middleware');
vi.mock('../services/sourceProcessingService');
vi.mock('../integrations/supabase/client');

const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(authMiddleware.requireAuth).mockImplementation(async (req, _res, next) => {
    req.auth = {
      userId: '11111111-1111-4111-8111-111111111111',
      isAnonymous: false,
      accessToken: 'fake-token',
    };
    next();
  });

  // Default mock: the internal ingestion key check passes — the write
  // endpoints are additionally gated by this, on top of requireAuth, per
  // middleware/internalIngestion.middleware.ts's docstring.
  vi.mocked(internalIngestionMiddleware.requireInternalIngestionKey).mockImplementation((_req, _res, next) => {
    next();
  });

  vi.mocked(supabaseClient.getAdminClient).mockReturnValue(
    {} as unknown as ReturnType<typeof supabaseClient.getAdminClient>,
  );
  vi.mocked(supabaseClient.createRequestScopedClient).mockReturnValue(
    {} as unknown as ReturnType<typeof supabaseClient.createRequestScopedClient>,
  );
});

describe('POST /api/v1/sources/ingest', () => {
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
      .set('x-internal-ingestion-key', 'test-key')
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.data.learningSourceId).toBe('22222222-2222-4222-8222-222222222222');
    expect(res.body.data.content.processingStatus).toBe('pending');
    expect(supabaseClient.getAdminClient).toHaveBeenCalled();
  });

  it('forwards domain validation errors as 400', async () => {
    vi.mocked(service.ingestLearningSource).mockRejectedValueOnce(
      new ApiError(400, 'INVALID_SOURCE_INPUT', 'Duration must be at least 25 minutes'),
    );

    const res = await request(app)
      .post('/api/v1/sources/ingest')
      .set('Authorization', 'Bearer fake-token')
      .set('x-internal-ingestion-key', 'test-key')
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

    const res = await request(app).post('/api/v1/sources/ingest').send(validBody);

    expect(res.status).toBe(401);
  });

  it('returns 403 when authenticated but the internal ingestion key is missing/invalid', async () => {
    vi.mocked(internalIngestionMiddleware.requireInternalIngestionKey).mockImplementation((_req, res) => {
      res.status(403).json({ error: { code: 'ingestion_key_invalid', message: 'Missing or invalid internal ingestion key' } });
    });

    const res = await request(app).post('/api/v1/sources/ingest').set('Authorization', 'Bearer fake-token').send(validBody);

    expect(res.status).toBe(403);
    expect(service.ingestLearningSource).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/sources/:contentId/process', () => {
  it('returns 200 and the structured record on success, via the admin client', async () => {
    const structured = {
      learningSourceId: 'src-1',
      title: 'Title',
      sourceType: 'transcript' as const,
      sourceReference: 'ref',
      durationMinutes: 30,
      content: {
        id: 'content-1',
        extractedText: 'text',
        contentHash: 'hash',
        processingStatus: 'completed' as const,
        processingError: null,
        processedAt: '2026-11-13T00:00:00.000Z',
        createdAt: '2026-11-13T00:00:00.000Z',
        updatedAt: '2026-11-13T00:00:00.000Z',
      },
      chunks: [],
    };
    vi.mocked(service.processSourceContent).mockResolvedValueOnce(structured);

    const res = await request(app)
      .post('/api/v1/sources/content-1/process')
      .set('Authorization', 'Bearer fake-token')
      .set('x-internal-ingestion-key', 'test-key')
      .send();

    expect(res.status).toBe(200);
    expect(res.body.data.learningSourceId).toBe('src-1');
    expect(supabaseClient.getAdminClient).toHaveBeenCalled();
  });

  it('returns 403 when the internal ingestion key is missing/invalid, even if authenticated', async () => {
    vi.mocked(internalIngestionMiddleware.requireInternalIngestionKey).mockImplementation((_req, res) => {
      res.status(403).json({ error: { code: 'ingestion_key_invalid', message: 'Missing or invalid internal ingestion key' } });
    });

    const res = await request(app).post('/api/v1/sources/content-1/process').set('Authorization', 'Bearer fake-token').send();

    expect(res.status).toBe(403);
    expect(service.processSourceContent).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/sources/:sourceId/structured', () => {
  it('returns 200 using the request-scoped client, never the admin client', async () => {
    const structured = {
      learningSourceId: 'src-1',
      title: 'Title',
      sourceType: 'transcript' as const,
      sourceReference: 'ref',
      durationMinutes: 30,
      content: {
        id: 'content-1',
        extractedText: 'text',
        contentHash: 'hash',
        processingStatus: 'completed' as const,
        processingError: null,
        processedAt: '2026-11-13T00:00:00.000Z',
        createdAt: '2026-11-13T00:00:00.000Z',
        updatedAt: '2026-11-13T00:00:00.000Z',
      },
      chunks: [],
    };
    vi.mocked(service.getStructuredSourceContext).mockResolvedValueOnce(structured);

    const res = await request(app).get('/api/v1/sources/src-1/structured').set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(200);
    expect(res.body.data.learningSourceId).toBe('src-1');
    expect(supabaseClient.createRequestScopedClient).toHaveBeenCalledWith('fake-token');
    expect(supabaseClient.getAdminClient).not.toHaveBeenCalled();
  });

  it('is not gated by the internal ingestion key (read-only, requireAuth only)', async () => {
    vi.mocked(service.getStructuredSourceContext).mockRejectedValueOnce(new ApiError(404, 'SOURCE_NOT_FOUND', 'not found'));

    const res = await request(app).get('/api/v1/sources/src-1/structured').set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(404);
    expect(internalIngestionMiddleware.requireInternalIngestionKey).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(authMiddleware.requireAuth).mockImplementation(async (_req, res) => {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing token' } });
    });

    const res = await request(app).get('/api/v1/sources/src-1/structured');

    expect(res.status).toBe(401);
  });
});
