import { z } from 'zod';

/**
 * Contract for GET /api/v1/me. Mirrors the verified identity attached by the
 * backend auth middleware (docs/API_CONTRACTS.md §... "GET /api/v1/me",
 * ADR-002) — never a client-supplied value.
 */
export const meResponseSchema = z.object({
  data: z.object({
    user: z.object({
      id: z.string().uuid(),
      isAnonymous: z.boolean(),
    }),
  }),
});

export type MeResponse = z.infer<typeof meResponseSchema>;
