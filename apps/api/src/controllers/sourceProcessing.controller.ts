import type { Request, Response } from 'express';
import { createRequestScopedClient, getAdminClient } from '../integrations/supabase/client';
import {
  getStructuredSourceContext,
  ingestLearningSource,
  processSourceContent,
} from '../services/sourceProcessingService';
import { ApiError } from '../types/api';
import type { ApiSuccess } from '../types/api';
import type { IngestedSourceSummary, StructuredSourceRecord } from '@tattva/contracts';

/**
 * Controller handling POST /api/v1/sources/ingest.
 *
 * Writes via the privileged admin client (bypasses RLS, docs/ARCHITECTURE.md
 * §6.3) — safe only because this route sits behind BOTH `requireAuth` and
 * `requireInternalIngestionKey` (see routes/sourceProcessing.routes.ts), not
 * behind ordinary end-user authentication alone.
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
 * Same privileged-client justification as `ingestSourceHandler` above.
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
 *
 * Deliberately uses the caller's request-scoped (RLS-protected) client, NOT
 * the admin client — `source_content`/`source_chunks` already grant SELECT
 * to any authenticated role (docs/DATABASE.md §10), so a plain read needs no
 * elevated privilege. Keeping the privileged client reserved for the two
 * write endpoints above is the least-privilege boundary ARCHITECTURE.md
 * §6.3 asks for.
 */
export async function getStructuredSourceHandler(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new ApiError(401, 'missing_token', 'Authentication required');

  const client = createRequestScopedClient(req.auth.accessToken);
  const sourceId = req.params.sourceId as string;
  const structured = await getStructuredSourceContext(client, sourceId);

  const response: ApiSuccess<StructuredSourceRecord> = {
    data: structured,
  };

  res.status(200).json(response);
}
