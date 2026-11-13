import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ingestLearningSource,
  processSourceContent,
  getStructuredSourceContext,
} from './sourceProcessingService';
import * as repo from '../repositories/sourceProcessingRepository';
import { buildStandardSystemPrompt, buildResearchModeSystemPrompt } from '../integrations/sarvam/prompts';
import type { IngestSourceInput } from '@tattva/contracts';

vi.mock('../repositories/sourceProcessingRepository');

describe('End-to-End Pipeline Verification (Milestone 8)', () => {
  const mockClient = {} as unknown as SupabaseClient;

  // Real representative fixture matching the project's Memory Arena Allocators material
  const learningMaterialFixture: IngestSourceInput = {
    title: 'Memory Arena Allocators: Architecture & Trade-offs',
    description: 'An exhaustive walkthrough of bump allocation, high-water marks, and cache locality.',
    sourceType: 'transcript',
    durationMinutes: 38,
    sourceReference: 'seed/memory-arena-allocators.txt',
    rawBody: `\uFEFF
WEBVTT - Transcript of Lecture 14

00:00:01.000 --> 00:00:05.000
An arena allocator (or bump allocator) is a memory management scheme where memory is allocated sequentially from a pre-allocated buffer.

00:00:05.500 --> 00:00:10.000
Instead of tracking individual chunks with free lists, the allocator simply advances an offset pointer—the bump pointer.

00:00:10.500 --> 00:00:15.000
Because allocations do not maintain header metadata or bin lists, allocation is an O(1) pointer addition and comparison against capacity.

00:00:15.500 --> 00:00:20.000
Individual objects cannot be freed independently. When the lifetime of the objects concludes, the entire arena is reset or freed in a single constant-time operation.
    `.repeat(4), // Repeated to ensure realistic multi-paragraph length
  };

  it('successfully executes the full pipeline: Ingestion -> Extraction -> Normalization -> Chunking -> Persistence -> Retrieval -> Sarvam Prompt Consumption', async () => {
    // -------------------------------------------------------------------------
    // Phase 1: Ingestion
    // -------------------------------------------------------------------------
    vi.mocked(repo.findContentByHash).mockResolvedValueOnce(null);

    const persistedSourceId = 'ls-1111-2222';
    const persistedContentId = 'sc-3333-4444';
    const storedRawBody = learningMaterialFixture.rawBody;
    let storedStatus: 'pending' | 'processing' | 'completed' | 'failed' = 'pending';
    let storedChunks: Array<{
      id: string;
      sourceContentId: string;
      chunkIndex: number;
      body: string;
      tokenCount: number | null;
      metadata: Record<string, unknown> | null;
      createdAt: string;
    }> = [];
    let storedNormalizedBody = '';

    vi.mocked(repo.insertLearningSourceWithContent).mockImplementationOnce(
      async (_client, input, contentHash) => {
        return {
          learningSourceId: persistedSourceId,
          title: input.title,
          sourceType: input.sourceType,
          durationMinutes: input.durationMinutes,
          sourceReference: input.sourceReference,
          content: {
            id: persistedContentId,
            learningSourceId: persistedSourceId,
            contentHash,
            processingStatus: 'pending',
            processingError: null,
            processedAt: null,
            createdAt: '2026-11-13T00:00:00.000Z',
            updatedAt: '2026-11-13T00:00:00.000Z',
          },
        };
      },
    );

    const ingested = await ingestLearningSource(mockClient, learningMaterialFixture);

    expect(ingested.learningSourceId).toBe(persistedSourceId);
    expect(ingested.content.processingStatus).toBe('pending');
    expect(ingested.content.contentHash).toBeDefined();

    // -------------------------------------------------------------------------
    // Phase 2: Processing (Extraction, Normalization, Chunking, Persistence)
    // -------------------------------------------------------------------------
    vi.mocked(repo.findSourceContentById).mockImplementationOnce(async () => ({
      id: persistedContentId,
      learning_source_id: persistedSourceId,
      raw_body: storedRawBody,
      content_hash: 'initial-hash',
      processing_status: 'pending',
      processing_error: null,
      processed_at: null,
      created_at: '2026-11-13T00:00:00.000Z',
      updated_at: '2026-11-13T00:00:00.000Z',
    }));

    vi.mocked(repo.markProcessingStarted).mockImplementationOnce(async () => {
      storedStatus = 'processing';
    });

    vi.mocked(repo.persistChunksAndUpdateStatus).mockImplementationOnce(
      async (_client, _contentId, chunks, normalizedBody) => {
        storedChunks = chunks.map((c) => ({
          id: `chunk-uuid-${c.chunkIndex}`,
          sourceContentId: persistedContentId,
          chunkIndex: c.chunkIndex,
          body: c.body,
          tokenCount: c.tokenCount,
          metadata: c.metadata,
          createdAt: '2026-11-13T00:00:00.000Z',
        }));
        storedNormalizedBody = normalizedBody;
        storedStatus = 'completed';
        return storedChunks;
      },
    );

    vi.mocked(repo.getStructuredSource).mockImplementation(async () => ({
      learningSourceId: persistedSourceId,
      title: learningMaterialFixture.title,
      sourceType: learningMaterialFixture.sourceType,
      sourceReference: learningMaterialFixture.sourceReference,
      durationMinutes: learningMaterialFixture.durationMinutes,
      content: {
        id: persistedContentId,
        extractedText: storedNormalizedBody,
        contentHash: 'normalized-hash',
        processingStatus: storedStatus,
        processingError: null,
        processedAt: '2026-11-13T00:00:00.000Z',
        createdAt: '2026-11-13T00:00:00.000Z',
        updatedAt: '2026-11-13T00:00:00.000Z',
      },
      chunks: storedChunks,
    }));

    const processed = await processSourceContent(mockClient, persistedContentId);

    // Verify processing state transitions
    expect(repo.markProcessingStarted).toHaveBeenCalledOnce();
    expect(repo.persistChunksAndUpdateStatus).toHaveBeenCalledOnce();
    expect(processed.content.processingStatus).toBe('completed');
    expect(processed.chunks.length).toBeGreaterThan(0);

    // Verify ordering
    processed.chunks.forEach((chunk, idx) => {
      expect(chunk.chunkIndex).toBe(idx);
      expect(chunk.body.length).toBeGreaterThan(0);
    });

    // -------------------------------------------------------------------------
    // Phase 3: Retrieval via Integration Interface
    // -------------------------------------------------------------------------
    const retrieved = await getStructuredSourceContext(mockClient, persistedSourceId);

    expect(retrieved.learningSourceId).toBe(persistedSourceId);
    expect(retrieved.content.processingStatus).toBe('completed');
    expect(retrieved.chunks).toEqual(processed.chunks);

    // -------------------------------------------------------------------------
    // Phase 4: Verification with Sarvam Prompt Builder (Integration Contract)
    // -------------------------------------------------------------------------
    // Primary developer's sourceContext selects either the full normalized text or a chunk
    const selectedChunk = retrieved.chunks[0]!.body;

    // Both prompt builders must accept the retrieved excerpt directly without error
    const standardPrompt = buildStandardSystemPrompt(selectedChunk);
    expect(standardPrompt).toContain('SOURCE MATERIAL (trusted, curated):');
    expect(standardPrompt).toContain(selectedChunk);

    const researchPrompt = buildResearchModeSystemPrompt(selectedChunk);
    expect(researchPrompt).toContain('SOURCE MATERIAL (trusted, curated):');
    expect(researchPrompt).toContain(selectedChunk);
  });
});
