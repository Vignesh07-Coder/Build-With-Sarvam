import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { ApiError } from '../types/api';

/**
 * Gates the source-ingestion write endpoints (`routes/sourceProcessing.routes.ts`:
 * POST /sources/ingest, POST /sources/:contentId/process), which use the
 * privileged, RLS-bypassing service-role client (docs/ARCHITECTURE.md §6.3).
 *
 * `requireAuth` alone is not a sufficient gate here: any caller can create a
 * free anonymous Supabase Auth session (ADR-002) and would otherwise pass it,
 * letting an arbitrary anonymous visitor write directly into `learning_sources`/
 * `source_content` via the admin client — the exact "narrowly restrict
 * privileged service-role operations to trusted workflows" boundary
 * `ARCHITECTURE.md` §6.3 requires. This middleware requires a separate,
 * server-operator-only shared secret, checked in addition to `requireAuth`,
 * so only trusted content-curation tooling (not an end user) can reach the
 * privileged write path.
 *
 * Read-only access to already-processed source content does not go through
 * this gate — it uses the request-scoped client under ordinary RLS instead
 * (see `getStructuredSourceHandler` in `sourceProcessing.controller.ts`).
 */
export function requireInternalIngestionKey(req: Request, _res: Response, next: NextFunction): void {
  if (!env.INTERNAL_INGESTION_KEY) {
    next(new ApiError(503, 'ingestion_not_configured', 'Source ingestion is not configured on this server'));
    return;
  }

  const provided = req.headers['x-internal-ingestion-key'];
  if (typeof provided !== 'string' || provided !== env.INTERNAL_INGESTION_KEY) {
    next(new ApiError(403, 'ingestion_key_invalid', 'Missing or invalid internal ingestion key'));
    return;
  }

  next();
}
