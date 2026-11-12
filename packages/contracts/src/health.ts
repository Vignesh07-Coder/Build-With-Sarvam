import { z } from 'zod';

/**
 * Contract for GET /health. Intentionally a flat shape (not the general
 * { data: ... } envelope used by versioned /api/v1 routes) because /health
 * is an unversioned liveness check consumed by infra tooling as well as the app.
 */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('tattva-api'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
