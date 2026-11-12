import type { LearningSource } from '../../lib/workspace-types';

export function SourceMetadata({ source }: { source: LearningSource }) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-white/45">
      <div className="flex gap-1.5">
        <dt className="uppercase tracking-wide">Runtime</dt>
        <dd className="text-white/70">{source.durationMinutes} min</dd>
      </div>
      <div className="flex gap-1.5">
        <dt className="uppercase tracking-wide">Reference</dt>
        <dd className="font-mono text-white/70">{source.sourceReference}</dd>
      </div>
    </dl>
  );
}
