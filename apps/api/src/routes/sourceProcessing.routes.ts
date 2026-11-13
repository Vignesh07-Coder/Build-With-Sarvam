import { Router } from 'express';
import {
  getStructuredSourceHandler,
  ingestSourceHandler,
  processSourceHandler,
} from '../controllers/sourceProcessing.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { requireInternalIngestionKey } from '../middleware/internalIngestion.middleware';

export const sourceProcessingRouter = Router();

/**
 * POST /api/v1/sources/ingest
 * Accepts learning material and records in 'pending' status. Writes via the
 * privileged admin client, so `requireInternalIngestionKey` is required in
 * addition to `requireAuth` — see that middleware's docstring.
 */
sourceProcessingRouter.post('/ingest', requireAuth, requireInternalIngestionKey, ingestSourceHandler);

/**
 * POST /api/v1/sources/:contentId/process
 * Runs normalization, chunking, and persists ordered chunks (status -> 'completed').
 * Same privileged-write gating as /ingest.
 */
sourceProcessingRouter.post('/:contentId/process', requireAuth, requireInternalIngestionKey, processSourceHandler);

/**
 * GET /api/v1/sources/:sourceId/structured
 * Returns full structured source and all ordered chunks for AI retrieval.
 * Read-only and RLS-permitted for any authenticated caller, so this route
 * only needs `requireAuth` (see controller for why no admin client is used).
 */
sourceProcessingRouter.get('/:sourceId/structured', requireAuth, getStructuredSourceHandler);
