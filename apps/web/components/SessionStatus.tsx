'use client';

import { useEffect, useState } from 'react';
import { AuthNotConfiguredError } from '../lib/auth';
import { ensureDemoInquiry, type DemoInquirySession } from '../lib/workspace-bootstrap';

type Status =
  | { kind: 'loading' }
  | { kind: 'ready'; session: DemoInquirySession }
  | { kind: 'not_configured' }
  | { kind: 'error'; message: string };

/**
 * Surfaces the real, persistent identity/inquiry established in the
 * background (Stage 5 objective) without altering the existing Workspace
 * UI (CLAUDE.md §8: "do not unnecessarily redesign the frontend"). The
 * Knowledge Graph itself still renders from fixtures until Sarvam
 * integration — this banner makes that distinction explicit rather than
 * silently presenting fixture data as a verified session.
 */
export function SessionStatus() {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    ensureDemoInquiry()
      .then((session) => {
        if (!cancelled) setStatus({ kind: 'ready', session });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof AuthNotConfiguredError) {
          setStatus({ kind: 'not_configured' });
          return;
        }
        setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const dotColor =
    status.kind === 'ready' ? 'bg-emerald-500' : status.kind === 'error' ? 'bg-red-500' : 'bg-amber-500';

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-2 rounded-md border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white/80 backdrop-blur-sm">
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} aria-hidden />
      {status.kind === 'loading' && <span>Establishing session…</span>}
      {status.kind === 'ready' && (
        <span>
          Session {status.session.isAnonymous ? '(anonymous)' : ''} · inquiry {status.session.inquiryId.slice(0, 8)}
          … persisted
        </span>
      )}
      {status.kind === 'not_configured' && <span>Demo mode — Supabase not configured, fixtures only</span>}
      {status.kind === 'error' && <span>Session error: {status.message}</span>}
    </div>
  );
}
