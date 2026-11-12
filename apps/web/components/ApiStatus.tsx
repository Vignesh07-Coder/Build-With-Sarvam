'use client';

import { useEffect, useState } from 'react';
import { getHealth } from '../lib/api-client';

type Status = { kind: 'loading' } | { kind: 'ok'; service: string } | { kind: 'error'; message: string };

/**
 * Minimal frontend <-> backend connectivity indicator (Stage 3, Phase 9).
 * Proves the web app can reach the API's /health endpoint through the
 * centralized API client; not a product feature.
 */
export function ApiStatus() {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    getHealth()
      .then((health) => {
        if (!cancelled) setStatus({ kind: 'ok', service: health.service });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const dotColor =
    status.kind === 'ok' ? 'bg-emerald-500' : status.kind === 'error' ? 'bg-red-500' : 'bg-amber-500';

  return (
    <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm">
      <span className={`h-2 w-2 rounded-full ${dotColor}`} aria-hidden />
      {status.kind === 'loading' && <span>Checking API connection…</span>}
      {status.kind === 'ok' && <span>Connected to {status.service}</span>}
      {status.kind === 'error' && <span>API unreachable: {status.message}</span>}
    </div>
  );
}
