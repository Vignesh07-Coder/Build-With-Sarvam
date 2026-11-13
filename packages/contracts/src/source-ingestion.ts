import { z } from 'zod';
import { sourceTypeSchema } from './learning-source';
import { sourceContentSummarySchema } from './source-content';

/**
 * Contracts for learning material ingestion (Item 2 / Milestone 3).
 *
 * Enforces PRD §2 constraints:
 * - durationMinutes >= 25 (minimum threshold for technical learning material)
 * - non-empty title and description
 * - rawBody minimum 100 characters, capped at 500,000 characters (~500 KB)
 */
export const ingestSourceInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title cannot be empty')
    .max(255, 'Title must not exceed 255 characters'),
  description: z
    .string()
    .trim()
    .min(1, 'Description cannot be empty')
    .max(2000, 'Description must not exceed 2000 characters'),
  sourceType: sourceTypeSchema,
  durationMinutes: z
    .number()
    .int('Duration must be an integer')
    .min(25, 'Learning source duration must be at least 25 minutes (PRD §2)'),
  sourceReference: z
    .string()
    .trim()
    .min(1, 'Source reference cannot be empty'),
  rawBody: z
    .string()
    .min(100, 'Source material body must be at least 100 characters')
    .max(500000, 'Source material body must not exceed 500,000 characters (~500 KB)'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type IngestSourceInput = z.infer<typeof ingestSourceInputSchema>;

export const ingestedSourceSummarySchema = z.object({
  learningSourceId: z.string().uuid(),
  title: z.string(),
  sourceType: sourceTypeSchema,
  durationMinutes: z.number().int(),
  sourceReference: z.string(),
  content: sourceContentSummarySchema,
});

export type IngestedSourceSummary = z.infer<typeof ingestedSourceSummarySchema>;

export const ingestSourceResponseSchema = z.object({
  data: ingestedSourceSummarySchema,
});

export type IngestSourceResponse = z.infer<typeof ingestSourceResponseSchema>;

