import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ingestLearningSource,
  processSourceContent,
  getStructuredSourceContext,
} from './sourceProcessingService';
import * as repo from '../repositories/sourceProcessingRepository';
import { ApiError } from '../types/api';

vi.mock('../repositories/sourceProcessingRepository');

describe('sourceProcessingService - Lifecycle & Failure Handling', () => {
  const mockClient = {} as unknown as SupabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validPayload = {
    title: 'Operating Systems: Memory Virtualization',
    description: 'Paging, multi-level page tables, TLBs, and hardware walking.',
    sourceType: 'transcript',
    durationMinutes: 40,
    sourceReference: 'seed/virtual-memory.txt',
    rawBody: 'Memory virtualization provides each process with the illusion of private memory. '.repeat(
      5,
    ),
  };

  it('successfully ingests valid learning material with initial status "pending"', async () => {
    vi.mocked(repo.findContentByHash).mockResolvedValueOnce(null);
    vi.mocked(repo.insertLearningSourceWithContent).mockResolvedValueOnce({
      learningSourceId: '11111111-1111-4111-8111-111111111111',
      title: validPayload.title,
      sourceType: 'transcript',
      durationMinutes: 40,
      sourceReference: validPayload.sourceReference,
      content: {
        id: '22222222-2222-4222-8222-222222222222',
        learningSourceId: '11111111-1111-4111-8111-111111111111',
        contentHash: 'somehash',
        processingStatus: 'pending',
        processingError: null,
        processedAt: null,
        createdAt: '2026-11-13T00:00:00.000Z',
        updatedAt: '2026-11-13T00:00:00.000Z',
      },
    });

    const result = await ingestLearningSource(mockClient, validPayload);

    expect(result.learningSourceId).toBe('11111111-1111-4111-8111-111111111111');
    expect(result.content.processingStatus).toBe('pending');
    expect(repo.insertLearningSourceWithContent).toHaveBeenCalledOnce();
  });

  it('rejects input with duration < 25 with 400 ApiError', async () => {
    const invalid = { ...validPayload, durationMinutes: 15 };

    await expect(ingestLearningSource(mockClient, invalid)).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_SOURCE_INPUT',
    });
  });

  it('rejects input with body length < 100 with 400 ApiError', async () => {
    const invalid = { ...validPayload, rawBody: 'Short text' };

    await expect(ingestLearningSource(mockClient, invalid)).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_SOURCE_INPUT',
    });
  });

  it('rejects duplicate content with 409 ApiError', async () => {
    vi.mocked(repo.findContentByHash).mockResolvedValue({
      id: 'existing-content-id',
      learningSourceId: 'existing-source-id',
    });

    await expect(ingestLearningSource(mockClient, validPayload)).rejects.toMatchObject({
      statusCode: 409,
      code: 'DUPLICATE_SOURCE_CONTENT',
    });
  });

  it('transitions status through processing -> completed on successful processing', async () => {
    vi.mocked(repo.findSourceContentById).mockResolvedValueOnce({
      id: 'c1',
      learning_source_id: 's1',
      raw_body: validPayload.rawBody,
      content_hash: 'initialhash',
      processing_status: 'pending',
      processing_error: null,
      processed_at: null,
      created_at: '2026-11-13T00:00:00.000Z',
      updated_at: '2026-11-13T00:00:00.000Z',
    });

    vi.mocked(repo.markProcessingStarted).mockResolvedValueOnce();
    vi.mocked(repo.persistChunksAndUpdateStatus).mockResolvedValueOnce([]);
    vi.mocked(repo.getStructuredSource).mockResolvedValueOnce({
      learningSourceId: 's1',
      title: 'Title',
      sourceType: 'transcript',
      sourceReference: 'ref',
      durationMinutes: 40,
      content: {
        id: 'c1',
        extractedText: validPayload.rawBody,
        contentHash: 'newhash',
        processingStatus: 'completed',
        processingError: null,
        processedAt: '2026-11-13T00:00:00.000Z',
        createdAt: '2026-11-13T00:00:00.000Z',
        updatedAt: '2026-11-13T00:00:00.000Z',
      },
      chunks: [],
    });

    const result = await processSourceContent(mockClient, 'c1');

    expect(repo.markProcessingStarted).toHaveBeenCalledWith(mockClient, 'c1');
    expect(repo.persistChunksAndUpdateStatus).toHaveBeenCalledOnce();
    expect(result.content.processingStatus).toBe('completed');
  });

  it('marks source as "failed" when raw body extraction produces empty text', async () => {
    vi.mocked(repo.findSourceContentById).mockResolvedValueOnce({
      id: 'c1',
      learning_source_id: 's1',
      raw_body: '   \n\t\n   ', // whitespace only
      content_hash: 'hash',
      processing_status: 'pending',
      processing_error: null,
      processed_at: null,
      created_at: 'now',
      updated_at: 'now',
    });

    vi.mocked(repo.markProcessingStarted).mockResolvedValueOnce();
    vi.mocked(repo.markProcessingFailed).mockResolvedValueOnce();

    await expect(processSourceContent(mockClient, 'c1')).rejects.toThrow(ApiError);

    expect(repo.markProcessingFailed).toHaveBeenCalledWith(
      mockClient,
      'c1',
      expect.stringContaining('empty after normalization'),
    );
  });

  it('marks source as "failed" when database chunk persistence fails', async () => {
    vi.mocked(repo.findSourceContentById).mockResolvedValueOnce({
      id: 'c1',
      learning_source_id: 's1',
      raw_body: validPayload.rawBody,
      content_hash: 'hash',
      processing_status: 'pending',
      processing_error: null,
      processed_at: null,
      created_at: 'now',
      updated_at: 'now',
    });

    vi.mocked(repo.markProcessingStarted).mockResolvedValueOnce();
    vi.mocked(repo.persistChunksAndUpdateStatus).mockRejectedValueOnce(
      new Error('DB write failed: connection lost'),
    );
    vi.mocked(repo.markProcessingFailed).mockResolvedValueOnce();

    await expect(processSourceContent(mockClient, 'c1')).rejects.toMatchObject({
      statusCode: 500,
      code: 'SOURCE_PROCESSING_FAILED',
    });

    expect(repo.markProcessingFailed).toHaveBeenCalledWith(
      mockClient,
      'c1',
      expect.stringContaining('DB write failed: connection lost'),
    );
  });

  it('prevents retrieval of source when processingStatus !== "completed"', async () => {
    vi.mocked(repo.getStructuredSource).mockResolvedValueOnce({
      learningSourceId: 's1',
      title: 'Title',
      sourceType: 'transcript',
      sourceReference: 'ref',
      durationMinutes: 40,
      content: {
        id: 'c1',
        extractedText: 'Partial text',
        contentHash: 'hash',
        processingStatus: 'failed',
        processingError: 'Chunking broke',
        processedAt: null,
        createdAt: 'now',
        updatedAt: 'now',
      },
      chunks: [],
    });

    await expect(getStructuredSourceContext(mockClient, 's1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'SOURCE_NOT_READY',
    });
  });
});
