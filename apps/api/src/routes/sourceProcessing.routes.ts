import { Router } from 'express';
import {
  getStructuredSourceHandler,
  ingestSourceHandler,
  processSourceHandler,
} from '../controllers/sourceProcessing.controller';
import { requireAuth } from '../middleware/auth.middleware';

export const sourceProcessingRouter = Router();

/**
 * POST /api/v1/sources/ingest
 * Accepts learning material and records in 'pending' status.
 */
sourceProcessingRouter.post('/ingest', requireAuth, ingestSourceHandler);

/**
 * POST /api/v1/sources/:contentId/process
 * Runs normalization, chunking, and persists ordered chunks (status -> 'completed').
 */
sourceProcessingRouter.post('/:contentId/process', requireAuth, processSourceHandler);

/**
 * GET /api/v1/sources/:sourceId/structured
 * Returns full structured source and all ordered chunks for AI retrieval.
 */
sourceProcessingRouter.get('/:sourceId/structured', requireAuth, getStructuredSourceHandler);
