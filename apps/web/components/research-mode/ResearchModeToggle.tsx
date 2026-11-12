export function ResearchModeToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className="flex items-center gap-2.5 rounded-sm border border-white/15 px-2.5 py-1.5 transition-colors hover:border-white/25"
    >
      <span
        className={`text-xs font-medium uppercase tracking-[0.15em] ${enabled ? 'text-amber-300' : 'text-white/50'}`}
      >
        Research mode
      </span>
      <span
        className={[
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors',
          enabled ? 'border-amber-400/50 bg-amber-400/20' : 'border-white/20 bg-white/10',
        ].join(' ')}
      >
        <span
          className={[
            'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
            enabled ? 'translate-x-[18px]' : 'translate-x-[3px]',
          ].join(' ')}
        />
      </span>
    </button>
  );
}
