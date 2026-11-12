import { z } from 'zod';

/**
 * Contract for the curated `learning_sources` row, as embedded in
 * GET /api/v1/inquiries/:inquiryId (docs/API_CONTRACTS.md §3,
 * docs/DATABASE.md §3.1). The hackathon MVP never writes this table from
 * the API — rows are seeded only — so no create/update schema exists here.
 */
export const sourceTypeSchema = z.enum(['video', 'document', 'transcript']);

export const learningSourceSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  sourceType: sourceTypeSchema,
  sourceReference: z.string(),
  durationMinutes: z.number().int().min(25),
});

export type LearningSourceSummary = z.infer<typeof learningSourceSummarySchema>;
