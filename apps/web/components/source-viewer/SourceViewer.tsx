import type { LearningSource } from '../../lib/workspace-types';
import { Panel } from '../shared/Panel';
import { Badge } from '../shared/Badge';
import { SourceMetadata } from './SourceMetadata';

export function SourceViewer({ source, body }: { source: LearningSource; body: string }) {
  return (
    <Panel title="Source material" className="h-full border-r border-white/10">
      <div className="flex h-full flex-col overflow-y-auto">
        <div className="shrink-0 space-y-3 border-b border-white/10 px-6 py-5">
          <Badge tone="accent">{source.sourceType}</Badge>
          <h1 className="text-xl font-semibold leading-snug text-white">{source.title}</h1>
          <p className="text-sm leading-relaxed text-white/60">{source.description}</p>
          <SourceMetadata source={source} />
        </div>
        {/* Reserved for future PDF/video embed; MVP renders the parsed text body. */}
        <article className="flex-1 whitespace-pre-line px-6 py-6 text-[15px] leading-7 text-white/80">
          {body}
        </article>
      </div>
    </Panel>
  );
}
