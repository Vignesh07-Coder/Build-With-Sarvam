import { z } from 'zod';

/**
 * Shared error envelope for versioned /api/v1 routes (docs/API_CONTRACTS.md §0).
 */
export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
