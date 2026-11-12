import type { QuestionNode, TrapSubmissionState } from '../../lib/workspace-types';
import { Badge } from '../shared/Badge';
import { TrapPanel } from '../trap/TrapPanel';

export function NodeDetailPanel({
  node,
  onSelectFollowUp,
  trapSubmissionState,
  onSubmitTrap,
}: {
  node: QuestionNode;
  onSelectFollowUp: (followUpId: string) => void;
  trapSubmissionState: TrapSubmissionState;
  onSubmitTrap: (response: string) => void;
}) {
  const trapBlocksProgress = node.isTrap && !node.trapResolvedAt;

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-white/40">
          Question
          {node.researchMode && <Badge tone="accent">research mode</Badge>}
        </p>
        <p className="text-sm font-medium text-white/90">{node.userQuestion}</p>
      </div>

      <div>
        <p className="mb-1 text-[11px] uppercase tracking-wide text-white/40">Explanation</p>
        <p className="text-sm leading-relaxed text-white/75">{node.aiExplanation}</p>
      </div>

      {node.isTrap && node.trapMetadata && (
        <TrapPanel
          trap={node.trapMetadata}
          resolved={Boolean(node.trapResolvedAt)}
          submissionState={trapSubmissionState}
          onSubmit={onSubmitTrap}
        />
      )}

      <div>
        <p className="mb-1.5 text-[11px] uppercase tracking-wide text-white/40">
          Follow-ups {trapBlocksProgress && '(blocked by trap)'}
        </p>
        <div className="flex flex-wrap gap-2">
          {node.followUps.map((followUp) => (
            <button
              key={followUp.id}
              type="button"
              disabled={trapBlocksProgress}
              onClick={() => onSelectFollowUp(followUp.id)}
              className={[
                'rounded-sm border px-2.5 py-1.5 text-left text-xs leading-snug transition-colors',
                followUp.isSelected ? 'border-amber-400/40 bg-amber-400/10 text-amber-200' : 'border-white/15 text-white/70 hover:border-white/30',
                trapBlocksProgress ? 'cursor-not-allowed opacity-40' : '',
              ].join(' ')}
            >
              {followUp.questionText}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
