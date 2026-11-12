import type { Request, Response } from 'express';
import { healthResponseSchema, type HealthResponse } from '@tattva/contracts';

export function getHealth(_req: Request, res: Response<HealthResponse>): void {
  const payload = healthResponseSchema.parse({
    status: 'ok',
    service: 'tattva-api',
  });

  res.status(200).json(payload);
}
