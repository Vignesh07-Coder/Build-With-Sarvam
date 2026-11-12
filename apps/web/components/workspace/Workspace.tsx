'use client';

import { useMemo, useState } from 'react';
import type { LearningSource, QuestionNode, StaminaState, TrapSubmissionState } from '../../lib/workspace-types';
import { SourceViewer } from '../source-viewer/SourceViewer';
import { KnowledgeGraphCanvas, type GraphStatus } from '../knowledge-graph/KnowledgeGraphCanvas';
import { ResearchModeToggle } from '../research-mode/ResearchModeToggle';
import { StaminaDisplay } from '../stamina/StaminaDisplay';
import { InquiryComposer } from '../inquiry/InquiryComposer';
import { Panel } from '../shared/Panel';
import { NodeDetailPanel } from './NodeDetailPanel';

const NOT_CONNECTED_MESSAGE =
  'Sarvam integration is not wired up yet — this will call POST /api/v1/inquiries/:inquiryId/nodes.';

export function Workspace({
  source,
  sourceBody,
  initialNodes,
  initialStamina,
}: {
  source: LearningSource;
  sourceBody: string;
  initialNodes: QuestionNode[];
  initialStamina: StaminaState;
}) {
  const [nodes] = useState<QuestionNode[]>(initialNodes);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(initialNodes[0]?.id ?? null);
  const [researchMode, setResearchMode] = useState(false);
  const [stamina] = useState<StaminaState>(initialStamina);
  const [graphStatus, setGraphStatus] = useState<GraphStatus>('ready');
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [trapSubmissions, setTrapSubmissions] = useState<Record<string, TrapSubmissionState>>({});

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);

  function runNotConnectedFlow() {
    setGraphStatus('loading');
    setPendingMessage(null);
    window.setTimeout(() => {
      setGraphStatus('error');
      setPendingMessage(NOT_CONNECTED_MESSAGE);
    }, 700);
  }

  function handleComposerSubmit(_question: string) {
    runNotConnectedFlow();
  }

  function handleSelectFollowUp(followUpId: string) {
    if (!selectedNode) return;
    const followUp = selectedNode.followUps.find((candidate) => candidate.id === followUpId);
    if (!followUp) return;

    if (followUp.childNodeId) {
      setSelectedNodeId(followUp.childNodeId);
      setGraphStatus('ready');
      setPendingMessage(null);
      return;
    }

    runNotConnectedFlow();
  }

  function handleSubmitTrap(nodeId: string, _response: string) {
    setTrapSubmissions((current) => ({ ...current, [nodeId]: 'submitting' }));
    window.setTimeout(() => {
      setTrapSubmissions((current) => ({ ...current, [nodeId]: 'submitted' }));
    }, 600);
  }

  return (
    <div className="grid h-screen grid-cols-1 grid-rows-2 bg-[#0b0b0d] text-white lg:grid-cols-2 lg:grid-rows-1">
      <div className="min-h-0 border-b border-white/10 lg:border-b-0">
        <SourceViewer source={source} body={sourceBody} />
      </div>

      <div className="flex h-full min-h-0 flex-col">
        <Panel
          title="Knowledge graph"
          actions={
            <>
              <StaminaDisplay stamina={stamina} researchMode={researchMode} />
              <ResearchModeToggle enabled={researchMode} onChange={setResearchMode} />
            </>
          }
          className="min-h-0 flex-1"
        >
          <div className="h-full min-h-[280px]">
            <KnowledgeGraphCanvas
              nodes={nodes}
              selectedNodeId={selectedNodeId}
              onSelectNode={(nodeId) => {
                setSelectedNodeId(nodeId);
                setGraphStatus('ready');
                setPendingMessage(null);
              }}
              status={graphStatus}
              errorMessage={pendingMessage ?? undefined}
              onRetry={() => {
                setGraphStatus('ready');
                setPendingMessage(null);
              }}
            />
          </div>
        </Panel>

        <div className="max-h-[42%] shrink-0 space-y-4 overflow-y-auto border-t border-white/10 px-5 py-4">
          {pendingMessage && (
            <p className="rounded-sm border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-xs text-amber-200">
              {pendingMessage}
            </p>
          )}

          {selectedNode && (
            <NodeDetailPanel
              node={selectedNode}
              onSelectFollowUp={handleSelectFollowUp}
              trapSubmissionState={trapSubmissions[selectedNode.id] ?? 'idle'}
              onSubmitTrap={(response) => handleSubmitTrap(selectedNode.id, response)}
            />
          )}

          <InquiryComposer
            loading={graphStatus === 'loading'}
            placeholder={
              researchMode
                ? 'Research mode is on — expect citations and Socratic questions, not direct answers.'
                : undefined
            }
            onSubmit={handleComposerSubmit}
          />
        </div>
      </div>
    </div>
  );
}
