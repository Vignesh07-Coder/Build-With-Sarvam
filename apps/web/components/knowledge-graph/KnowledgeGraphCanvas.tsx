'use client';

import { useMemo } from 'react';
import { ReactFlow, Background, Controls, MiniMap, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { QuestionNode } from '../../lib/workspace-types';
import { computeGraphLayout } from '../../lib/graph-layout';
import { QuestionGraphNode, type QuestionGraphNodeType } from './QuestionGraphNode';
import { EmptyGraphState, ErrorGraphState, LoadingGraphState } from './GraphStates';

const nodeTypes = { questionNode: QuestionGraphNode };

export type GraphStatus = 'ready' | 'loading' | 'error';

export function KnowledgeGraphCanvas({
  nodes,
  selectedNodeId,
  onSelectNode,
  status,
  errorMessage,
  onRetry,
}: {
  nodes: QuestionNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  status: GraphStatus;
  errorMessage?: string;
  onRetry?: () => void;
}) {
  const positions = useMemo(() => computeGraphLayout(nodes), [nodes]);

  const flowNodes: QuestionGraphNodeType[] = useMemo(
    () =>
      nodes.map((node) => ({
        id: node.id,
        type: 'questionNode',
        data: { node, isRoot: node.parentNodeId === null },
        position: positions[node.id] ?? { x: 0, y: 0 },
        selected: node.id === selectedNodeId,
      })),
    [nodes, positions, selectedNodeId],
  );

  const flowEdges: Edge[] = useMemo(
    () =>
      nodes
        .filter((node) => node.parentNodeId !== null)
        .map((node) => ({
          id: `${node.parentNodeId}-${node.id}`,
          source: node.parentNodeId as string,
          target: node.id,
          style: { stroke: 'rgba(255,255,255,0.25)' },
        })),
    [nodes],
  );

  if (status === 'loading' && nodes.length === 0) {
    return <LoadingGraphState />;
  }

  if (status === 'error' && nodes.length === 0) {
    return <ErrorGraphState message={errorMessage ?? 'Something went wrong.'} onRetry={onRetry} />;
  }

  if (nodes.length === 0) {
    return <EmptyGraphState />;
  }

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, node) => onSelectNode(node.id)}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      colorMode="dark"
      nodesDraggable={false}
      nodesConnectable={false}
      edgesReconnectable={false}
    >
      <Background color="rgba(255,255,255,0.06)" gap={24} />
      <Controls showInteractive={false} />
      <MiniMap
        position="top-right"
        pannable
        zoomable
        className="!h-20 !w-28 !bg-[#141417]"
        maskColor="rgba(0,0,0,0.6)"
        nodeColor="rgba(255,255,255,0.2)"
      />
    </ReactFlow>
  );
}
