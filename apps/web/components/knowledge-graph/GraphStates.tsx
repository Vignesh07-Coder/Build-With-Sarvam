export function EmptyGraphState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
      <p className="text-sm font-medium text-white/70">No inquiry yet</p>
      <p className="max-w-xs text-xs text-white/45">
        Ask a question about the source material to create the root node of this inquiry&apos;s Knowledge
        Graph.
      </p>
    </div>
  );
}

export function LoadingGraphState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3" role="status" aria-live="polite">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-amber-400" />
      <p className="text-xs text-white/50">Generating node…</p>
    </div>
  );
}

export function ErrorGraphState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center" role="alert">
      <p className="text-sm font-medium text-red-300">Couldn&apos;t generate a response</p>
      <p className="max-w-xs text-xs text-white/50">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-sm border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 hover:border-white/30 hover:bg-white/5"
        >
          Retry
        </button>
      )}
    </div>
  );
}
