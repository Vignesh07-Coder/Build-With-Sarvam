import { z } from 'zod';

/**
 * Contracts for `source_content` and `source_chunks` (docs/DATABASE.md §3.6–
 * §3.7). These tables are written by privileged tooling/seed only — no
 * browser writes — so only read-oriented schemas exist here. No
 * create/update request schemas are defined because no API endpoint writes
 * to these tables in the MVP.
 */

// ---------------------------------------------------------------------------
// Processing status
// ---------------------------------------------------------------------------

export const processingStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
]);

export type ProcessingStatus = z.infer<typeof processingStatusSchema>;

// ---------------------------------------------------------------------------
// Source content (1:1 with learning_sources)
// ---------------------------------------------------------------------------

export const sourceContentSchema = z.object({
  id: z.string().uuid(),
  learningSourceId: z.string().uuid(),
  rawBody: z.string(),
  contentHash: z.string(),
  processingStatus: processingStatusSchema,
  processingError: z.string().nullable(),
  processedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SourceContent = z.infer<typeof sourceContentSchema>;

/**
 * Lightweight summary for listings that omit the potentially large `rawBody`.
 */
export const sourceContentSummarySchema = z.object({
  id: z.string().uuid(),
  learningSourceId: z.string().uuid(),
  contentHash: z.string(),
  processingStatus: processingStatusSchema,
  processingError: z.string().nullable(),
  processedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SourceContentSummary = z.infer<typeof sourceContentSummarySchema>;

// ---------------------------------------------------------------------------
// Source chunks (ordered segments of a source_content record)
// ---------------------------------------------------------------------------

export const sourceChunkSchema = z.object({
  id: z.string().uuid(),
  sourceContentId: z.string().uuid(),
  chunkIndex: z.number().int().min(0),
  body: z.string(),
  tokenCount: z.number().int().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
});

export type SourceChunk = z.infer<typeof sourceChunkSchema>;

// ---------------------------------------------------------------------------
// Structured Source Context (Integration contract per Handover §7 / Milestone 6)
// ---------------------------------------------------------------------------

export const structuredSourceRecordSchema = z.object({
  learningSourceId: z.string().uuid(),
  title: z.string(),
  sourceType: z.enum(['video', 'document', 'transcript']),
  sourceReference: z.string(),
  durationMinutes: z.number().int(),
  content: z.object({
    id: z.string().uuid(),
    extractedText: z.string(),
    contentHash: z.string(),
    processingStatus: processingStatusSchema,
    processingError: z.string().nullable(),
    processedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  chunks: z.array(sourceChunkSchema),
});

export type StructuredSourceRecord = z.infer<typeof structuredSourceRecordSchema>;


