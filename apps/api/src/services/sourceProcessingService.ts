import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type IngestSourceInput,
  type IngestedSourceSummary,
  type StructuredSourceRecord,
  ingestSourceInputSchema,
} from '@tattva/contracts';
import {
  findContentByHash,
  findSourceContentById,
  getStructuredSource,
  insertLearningSourceWithContent,
  markProcessingFailed,
  markProcessingStarted,
  persistChunksAndUpdateStatus,
} from '../repositories/sourceProcessingRepository';
import { extractSourceText } from './sourceExtraction';
import { chunkSourceText } from './sourceChunking';
import { ApiError } from '../types/api';

/**
 * Computes deterministic SHA-256 hash of text content.
 */
export function computeContentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Service orchestrating learning material ingestion & input validation (Milestone 3).
 */
export async function ingestLearningSource(
  client: SupabaseClient,
  rawInput: unknown,
): Promise<IngestedSourceSummary> {
  // 1. Validate payload against strict contract rules
  const parseResult = ingestSourceInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    throw new ApiError(
      400,
      'INVALID_SOURCE_INPUT',
      'The provided learning material failed format or size validation.',
      {
        issues: parseResult.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
    );
  }

  const input: IngestSourceInput = parseResult.data;

  // 2. Compute initial content hash
  const contentHash = computeContentHash(input.rawBody);

  // 3. Deduplication check
  const existing = await findContentByHash(client, contentHash);
  if (existing) {
    throw new ApiError(
      409,
      'DUPLICATE_SOURCE_CONTENT',
      'Source material with identical content hash has already been ingested.',
      {
        existingContentId: existing.id,
        existingLearningSourceId: existing.learningSourceId,
      },
    );
  }

  // 4. Persist source and content record in 'pending' status
  return insertLearningSourceWithContent(client, input, contentHash);
}

/**
 * Executes full extraction, normalization, chunking, and persistence for ingested content (Milestones 4-6).
 */
export async function processSourceContent(
  client: SupabaseClient,
  sourceContentId: string,
): Promise<StructuredSourceRecord> {
  const contentRecord = await findSourceContentById(client, sourceContentId);
  if (!contentRecord) {
    throw new ApiError(404, 'SOURCE_CONTENT_NOT_FOUND', `Source content ${sourceContentId} not found.`);
  }

  // Explicit lifecycle state transition: pending -> processing
  await markProcessingStarted(client, sourceContentId);

  try {
    // 1. Extract and normalize
    const extraction = extractSourceText(contentRecord.raw_body);
    if (!extraction.text) {
      throw new Error('Extracted text is empty after normalization.');
    }

    // 2. Compute normalized hash
    const normalizedHash = computeContentHash(extraction.text);

    // 3. Chunk into deterministic units
    const chunks = chunkSourceText(extraction.text);
    if (chunks.length === 0) {
      throw new Error('No chunks generated from extracted text.');
    }

    // 4. Persist chunks & update status to 'completed'
    await persistChunksAndUpdateStatus(
      client,
      sourceContentId,
      chunks,
      extraction.text,
      normalizedHash,
    );

    // 5. Retrieve full structured record
    const structured = await getStructuredSource(client, contentRecord.learning_source_id);
    if (!structured) {
      throw new Error('Failed to retrieve structured source after persistence.');
    }

    return structured;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown processing error';
    await markProcessingFailed(client, sourceContentId, errorMsg);
    throw new ApiError(500, 'SOURCE_PROCESSING_FAILED', `Processing failed: ${errorMsg}`);
  }
}

/**
 * Retrieves the structured source record by learningSourceId (Milestone 6 / Handover §7).
 */
export async function getStructuredSourceContext(
  client: SupabaseClient,
  learningSourceId: string,
): Promise<StructuredSourceRecord> {
  const record = await getStructuredSource(client, learningSourceId);
  if (!record) {
    throw new ApiError(404, 'SOURCE_NOT_FOUND', `Learning source ${learningSourceId} was not found.`);
  }

  // Safety invariant: downstream consumers cannot read unready / failed sources
  if (record.content.processingStatus !== 'completed') {
    throw new ApiError(
      409,
      'SOURCE_NOT_READY',
      `Learning source content is not ready for consumption (current status: ${record.content.processingStatus}).`,
      {
        processingStatus: record.content.processingStatus,
        processingError: record.content.processingError,
      },
    );
  }

  return record;
}
