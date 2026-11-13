import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  findContentByHash,
  getStructuredSource,
  insertLearningSourceWithContent,
  markProcessingFailed,
  persistChunksAndUpdateStatus,
} from './sourceProcessingRepository';

describe('sourceProcessingRepository', () => {
  const mockFrom = vi.fn();
  const mockClient = { from: mockFrom } as unknown as SupabaseClient;

  it('inserts learning source and source content record', async () => {
    const singleSource = vi.fn().mockResolvedValue({
      data: {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Title',
        description: 'Desc',
        source_type: 'transcript',
        duration_minutes: 30,
        source_reference: 'ref',
      },
      error: null,
    });

    const singleContent = vi.fn().mockResolvedValue({
      data: {
        id: '22222222-2222-4222-8222-222222222222',
        learning_source_id: '11111111-1111-4111-8111-111111111111',
        content_hash: 'hash',
        processing_status: 'pending',
        processing_error: null,
        processed_at: null,
        created_at: 'now',
        updated_at: 'now',
      },
      error: null,
    });

    mockFrom
      .mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ single: singleSource }),
        }),
      })
      .mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ single: singleContent }),
        }),
      });

    const result = await insertLearningSourceWithContent(
      mockClient,
      {
        title: 'Title',
        description: 'Desc',
        sourceType: 'transcript',
        durationMinutes: 30,
        sourceReference: 'ref',
        rawBody: 'Content body',
      },
      'hash',
    );

    expect(result.learningSourceId).toBe('11111111-1111-4111-8111-111111111111');
    expect(result.content.processingStatus).toBe('pending');
  });

  it('finds existing content by hash', async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'c1', learning_source_id: 's1' },
            error: null,
          }),
        }),
      }),
    });

    const found = await findContentByHash(mockClient, 'somehash');
    expect(found).toEqual({ id: 'c1', learningSourceId: 's1' });
  });

  it('persists chunks and updates status to completed', async () => {
    const deleteMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'chunk-1',
              source_content_id: 'c1',
              chunk_index: 0,
              body: 'Chunk body 1',
              token_count: 50,
              metadata: { startOffset: 0, endOffset: 12, paragraphCount: 1 },
              created_at: 'now',
            },
          ],
          error: null,
        }),
      }),
    });
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    mockFrom
      .mockReturnValueOnce({ delete: deleteMock }) // 1. delete existing chunks
      .mockReturnValueOnce({ insert: insertMock }) // 2. insert chunks
      .mockReturnValueOnce({ update: updateMock }); // 3. update source_content status

    const chunks = await persistChunksAndUpdateStatus(
      mockClient,
      'c1',
      [
        {
          chunkIndex: 0,
          body: 'Chunk body 1',
          tokenCount: 50,
          characterCount: 12,
          metadata: { startOffset: 0, endOffset: 12, paragraphCount: 1 },
        },
      ],
      'Normalized body',
      'hash123',
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.chunkIndex).toBe(0);
    expect(chunks[0]?.body).toBe('Chunk body 1');
  });

  it('marks processing as failed with error message', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    mockFrom.mockReturnValueOnce({ update: updateMock });

    await expect(markProcessingFailed(mockClient, 'c1', 'Network failure')).resolves.not.toThrow();
  });

  it('retrieves full structured source and ordered chunks', async () => {
    const sourceMock = vi.fn().mockResolvedValue({
      data: {
        id: 's1',
        title: 'Title',
        source_type: 'transcript',
        source_reference: 'ref',
        duration_minutes: 35,
      },
      error: null,
    });

    const contentMock = vi.fn().mockResolvedValue({
      data: {
        id: 'c1',
        raw_body: 'Extracted text',
        content_hash: 'hash',
        processing_status: 'completed',
        processing_error: null,
        processed_at: 'now',
        created_at: 'now',
        updated_at: 'now',
      },
      error: null,
    });

    const chunksMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'chunk-1',
          source_content_id: 'c1',
          chunk_index: 0,
          body: 'First segment',
          token_count: 20,
          metadata: null,
          created_at: 'now',
        },
        {
          id: 'chunk-2',
          source_content_id: 'c1',
          chunk_index: 1,
          body: 'Second segment',
          token_count: 25,
          metadata: null,
          created_at: 'now',
        },
      ],
      error: null,
    });

    mockFrom
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: sourceMock }) }) })
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: contentMock }) }) })
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: chunksMock }) }) });

    const record = await getStructuredSource(mockClient, 's1');

    expect(record).not.toBeNull();
    expect(record?.learningSourceId).toBe('s1');
    expect(record?.content.extractedText).toBe('Extracted text');
    expect(record?.chunks).toHaveLength(2);
    expect(record?.chunks[0]?.chunkIndex).toBe(0);
    expect(record?.chunks[1]?.chunkIndex).toBe(1);
  });
});
