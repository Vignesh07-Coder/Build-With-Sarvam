import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  IngestSourceInput,
  IngestedSourceSummary,
  SourceChunk,
  StructuredSourceRecord,
} from '@tattva/contracts';
import type { ChunkUnit } from '../services/sourceChunking';

interface LearningSourceInsertRow {
  id: string;
  title: string;
  description: string;
  source_type: 'video' | 'document' | 'transcript';
  duration_minutes: number;
  source_reference: string;
  published_at?: string;
}

interface SourceContentRow {
  id: string;
  learning_source_id: string;
  raw_body: string;
  content_hash: string;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  processing_error: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SourceChunkRow {
  id: string;
  source_content_id: string;
  chunk_index: number;
  body: string;
  token_count: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Data access repository for learning material ingestion, chunking, and structured persistence.
 *
 * Dedicated to second-developer pipeline operations (SECOND_DEVELOPER_HANDOVER.md §5, §9).
 * Kept strictly separate from the existing read-only `learningSourceRepository.ts`.
 */
export async function insertLearningSourceWithContent(
  client: SupabaseClient,
  input: IngestSourceInput,
  contentHash: string,
): Promise<IngestedSourceSummary> {
  // 1. Insert learning_sources record
  const { data: sourceData, error: sourceError } = await client
    .from('learning_sources')
    .insert({
      title: input.title,
      description: input.description,
      source_type: input.sourceType,
      duration_minutes: input.durationMinutes,
      source_reference: input.sourceReference,
    })
    .select('id, title, description, source_type, duration_minutes, source_reference')
    .single();

  if (sourceError || !sourceData) {
    throw new Error(`Failed to insert learning source: ${sourceError?.message ?? 'unknown error'}`);
  }

  const learningSource = sourceData as LearningSourceInsertRow;

  // 2. Insert corresponding source_content in 'pending' status
  const { data: contentData, error: contentError } = await client
    .from('source_content')
    .insert({
      learning_source_id: learningSource.id,
      raw_body: input.rawBody,
      content_hash: contentHash,
      processing_status: 'pending',
    })
    .select(
      'id, learning_source_id, content_hash, processing_status, processing_error, processed_at, created_at, updated_at',
    )
    .single();

  if (contentError || !contentData) {
    // Attempt cleanup of orphaned learning source
    await client.from('learning_sources').delete().eq('id', learningSource.id);
    throw new Error(`Failed to insert source content: ${contentError?.message ?? 'unknown error'}`);
  }

  const content = contentData as SourceContentRow;

  return {
    learningSourceId: learningSource.id,
    title: learningSource.title,
    sourceType: learningSource.source_type,
    durationMinutes: learningSource.duration_minutes,
    sourceReference: learningSource.source_reference,
    content: {
      id: content.id,
      learningSourceId: content.learning_source_id,
      contentHash: content.content_hash,
      processingStatus: content.processing_status,
      processingError: content.processing_error,
      processedAt: content.processed_at,
      createdAt: content.created_at,
      updatedAt: content.updated_at,
    },
  };
}

/**
 * Check if content with an identical SHA-256 hash has already been ingested.
 */
export async function findContentByHash(
  client: SupabaseClient,
  contentHash: string,
): Promise<{ id: string; learningSourceId: string } | null> {
  const { data, error } = await client
    .from('source_content')
    .select('id, learning_source_id')
    .eq('content_hash', contentHash)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check existing content hash: ${error.message}`);
  }

  return data ? { id: data.id, learningSourceId: data.learning_source_id } : null;
}

/**
 * Load raw content row by source_content.id.
 */
export async function findSourceContentById(
  client: SupabaseClient,
  contentId: string,
): Promise<SourceContentRow | null> {
  const { data, error } = await client
    .from('source_content')
    .select('*')
    .eq('id', contentId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load source content ${contentId}: ${error.message}`);
  }

  return data as SourceContentRow | null;
}

/**
 * Atomically save chunks and update processing status on source_content.
 */
export async function persistChunksAndUpdateStatus(
  client: SupabaseClient,
  sourceContentId: string,
  chunks: ChunkUnit[],
  normalizedBody: string,
  contentHash: string,
): Promise<SourceChunk[]> {
  // 1. Delete any existing chunks for idempotency / re-processing
  const { error: deleteError } = await client
    .from('source_chunks')
    .delete()
    .eq('source_content_id', sourceContentId);

  if (deleteError) {
    throw new Error(`Failed to clear existing chunks for content ${sourceContentId}: ${deleteError.message}`);
  }

  // 2. Prepare chunk insert rows
  const chunkRows = chunks.map((c) => ({
    source_content_id: sourceContentId,
    chunk_index: c.chunkIndex,
    body: c.body,
    token_count: c.tokenCount,
    metadata: c.metadata,
  }));

  const { data: insertedChunks, error: insertError } = await client
    .from('source_chunks')
    .insert(chunkRows)
    .select('id, source_content_id, chunk_index, body, token_count, metadata, created_at')
    .order('chunk_index', { ascending: true });

  if (insertError || !insertedChunks) {
    // Mark status as failed
    await client
      .from('source_content')
      .update({
        processing_status: 'failed',
        processing_error: insertError?.message ?? 'Failed to persist chunks',
        updated_at: new Date().toISOString(),
      })
      .eq('id', sourceContentId);

    throw new Error(`Failed to insert chunks: ${insertError?.message ?? 'unknown error'}`);
  }

  // 3. Mark source_content as completed with updated normalized text & timestamp
  const now = new Date().toISOString();
  const { error: updateError } = await client
    .from('source_content')
    .update({
      raw_body: normalizedBody,
      content_hash: contentHash,
      processing_status: 'completed',
      processing_error: null,
      processed_at: now,
      updated_at: now,
    })
    .eq('id', sourceContentId);

  if (updateError) {
    throw new Error(`Failed to mark source content as completed: ${updateError.message}`);
  }

  return (insertedChunks as SourceChunkRow[]).map((row) => ({
    id: row.id,
    sourceContentId: row.source_content_id,
    chunkIndex: row.chunk_index,
    body: row.body,
    tokenCount: row.token_count,
    metadata: row.metadata,
    createdAt: row.created_at,
  }));
}

/**
 * Mark source_content status as actively 'processing'.
 */
export async function markProcessingStarted(
  client: SupabaseClient,
  sourceContentId: string,
): Promise<void> {
  const { error } = await client
    .from('source_content')
    .update({
      processing_status: 'processing',
      processing_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sourceContentId);

  if (error) {
    throw new Error(`Failed to mark source content as processing: ${error.message}`);
  }
}

/**
 * Record a processing error on source_content.
 */
export async function markProcessingFailed(
  client: SupabaseClient,
  sourceContentId: string,
  errorMessage: string,
): Promise<void> {
  const { error } = await client
    .from('source_content')
    .update({
      processing_status: 'failed',
      processing_error: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sourceContentId);

  if (error) {
    throw new Error(`Failed to mark source content as failed: ${error.message}`);
  }
}

/**
 * Retrieve full structured source and all ordered chunks for AI consumption (Milestone 6 / Handover §7).
 */
export async function getStructuredSource(
  client: SupabaseClient,
  learningSourceId: string,
): Promise<StructuredSourceRecord | null> {
  // 1. Fetch learning source
  const { data: sourceData, error: sourceError } = await client
    .from('learning_sources')
    .select('id, title, source_type, source_reference, duration_minutes')
    .eq('id', learningSourceId)
    .maybeSingle();

  if (sourceError || !sourceData) {
    return null;
  }

  // 2. Fetch source content
  const { data: contentData, error: contentError } = await client
    .from('source_content')
    .select('id, raw_body, content_hash, processing_status, processing_error, processed_at, created_at, updated_at')
    .eq('learning_source_id', learningSourceId)
    .maybeSingle();

  if (contentError || !contentData) {
    return null;
  }

  // 3. Fetch ordered chunks
  const { data: chunksData, error: chunksError } = await client
    .from('source_chunks')
    .select('id, source_content_id, chunk_index, body, token_count, metadata, created_at')
    .eq('source_content_id', contentData.id)
    .order('chunk_index', { ascending: true });

  if (chunksError) {
    throw new Error(`Failed to load chunks for content ${contentData.id}: ${chunksError.message}`);
  }

  const chunks: SourceChunk[] = (chunksData ?? []).map((row: SourceChunkRow) => ({
    id: row.id,
    sourceContentId: row.source_content_id,
    chunkIndex: row.chunk_index,
    body: row.body,
    tokenCount: row.token_count,
    metadata: row.metadata,
    createdAt: row.created_at,
  }));

  return {
    learningSourceId: sourceData.id,
    title: sourceData.title,
    sourceType: sourceData.source_type,
    sourceReference: sourceData.source_reference,
    durationMinutes: sourceData.duration_minutes,
    content: {
      id: contentData.id,
      extractedText: contentData.raw_body,
      contentHash: contentData.content_hash,
      processingStatus: contentData.processing_status as 'pending' | 'processing' | 'completed' | 'failed',
      processingError: contentData.processing_error,
      processedAt: contentData.processed_at,
      createdAt: contentData.created_at,
      updatedAt: contentData.updated_at,
    },
    chunks,
  };
}
