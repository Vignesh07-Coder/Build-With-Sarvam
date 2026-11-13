import type { Request, Response } from 'express';
import { getAdminClient } from '../integrations/supabase/client';
import {
  getStructuredSourceContext,
  ingestLearningSource,
  processSourceContent,
} from '../services/sourceProcessingService';
import type { ApiSuccess } from '../types/api';
import type { IngestedSourceSummary, StructuredSourceRecord } from '@tattva/contracts';

/**
 * Controller handling POST /api/v1/sources/ingest.
 */
export async function ingestSourceHandler(req: Request, res: Response): Promise<void> {
  const adminClient = getAdminClient();
  const summary = await ingestLearningSource(adminClient, req.body);

  const response: ApiSuccess<IngestedSourceSummary> = {
    data: summary,
  };

  res.status(201).json(response);
}

/**
 * Controller handling POST /api/v1/sources/:contentId/process.
 * Triggers full pipeline: extraction -> normalization -> chunking -> structured persistence.
 */
export async function processSourceHandler(req: Request, res: Response): Promise<void> {
  const adminClient = getAdminClient();
  const contentId = req.params.contentId as string;
  const structured = await processSourceContent(adminClient, contentId);

  const response: ApiSuccess<StructuredSourceRecord> = {
    data: structured,
  };

  res.status(200).json(response);
}

/**
 * Controller handling GET /api/v1/sources/:sourceId/structured.
 * Retrieves structured source record and all ordered chunks for AI consumption.
 */
export async function getStructuredSourceHandler(req: Request, res: Response): Promise<void> {
  const adminClient = getAdminClient();
  const sourceId = req.params.sourceId as string;
  const structured = await getStructuredSourceContext(adminClient, sourceId);

  const response: ApiSuccess<StructuredSourceRecord> = {
    data: structured,
  };

  res.status(200).json(response);
}
