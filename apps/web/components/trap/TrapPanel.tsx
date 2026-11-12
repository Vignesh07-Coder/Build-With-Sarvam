'use client';

import { useId, useState } from 'react';
import type { TrapMetadata, TrapSubmissionState } from '../../lib/workspace-types';

export function TrapPanel({
  trap,
  resolved,
  submissionState,
  onSubmit,
}: {
  trap: TrapMetadata;
  resolved: boolean;
  submissionState: TrapSubmissionState;
  onSubmit: (response: string) => void;
}) {
  const [response, setResponse] = useState('');
  const fieldId = useId();

  if (resolved) {
    return (
      <div className="rounded-md border border-emerald-400/30 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-300">
        Trap resolved — graph progression unlocked.
      </div>
    );
  }

  const disabled = submissionState === 'submitting' || submissionState === 'submitted';

  return (
    <div className="rounded-md border border-red-400/40 bg-red-400/5 p-4" role="alert">
      <p className="text-sm font-semibold uppercase tracking-wide text-red-300">⚠️ Be careful here!!</p>
      <p className="mt-2 text-xs font-medium uppercase tracking-wide text-white/40">
        Misconception: {trap.misconceptionType.replaceAll('_', ' ')}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-white/80">{trap.scenario}</p>

      <form
        className="mt-3 space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (response.trim().length === 0) return;
          onSubmit(response.trim());
        }}
      >
        <label htmlFor={fieldId} className="sr-only">
          Resolve the trap
        </label>
        <textarea
          id={fieldId}
          value={response}
          onChange={(event) => setResponse(event.target.value)}
          disabled={disabled}
          rows={3}
          placeholder="Explain exactly what happens and why — this input is required before the graph can proceed."
          className="w-full resize-none rounded-sm border border-white/15 bg-black/30 px-3 py-2 text-sm text-white/90 placeholder:text-white/30 focus:border-red-400/50 focus:outline-none disabled:opacity-60"
        />
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-white/40">
            {submissionState === 'submitted'
              ? 'Submitted — awaiting backend evaluation.'
              : 'The standard question input stays disabled until this is resolved.'}
          </p>
          <button
            type="submit"
            disabled={disabled || response.trim().length === 0}
            className="rounded-sm border border-red-400/40 bg-red-400/10 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submissionState === 'submitting' ? 'Submitting…' : 'Submit response'}
          </button>
        </div>
      </form>
    </div>
  );
}
