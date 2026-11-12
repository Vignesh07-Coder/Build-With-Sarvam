import type { QuestionNode } from './workspace-types';

const COLUMN_WIDTH = 300;
const ROW_HEIGHT = 190;

/**
 * Deterministic depth/sibling-order layout so the canvas doesn't need a
 * layout dependency for a tree this shallow. Root(s) at depth 0; each node's
 * x position is its in-order position among same-depth nodes.
 */
export function computeGraphLayout(nodes: QuestionNode[]): Record<string, { x: number; y: number }> {
  const byParent = new Map<string | null, QuestionNode[]>();
  for (const node of nodes) {
    const key = node.parentNodeId;
    const siblings = byParent.get(key) ?? [];
    siblings.push(node);
    byParent.set(key, siblings);
  }

  const positions: Record<string, { x: number; y: number }> = {};
  let nextColumn = 0;

  function place(parentId: string | null, depth: number) {
    const children = byParent.get(parentId) ?? [];
    for (const child of children) {
      const hasChildren = (byParent.get(child.id) ?? []).length > 0;
      if (!hasChildren) {
        positions[child.id] = { x: nextColumn * COLUMN_WIDTH, y: depth * ROW_HEIGHT };
        nextColumn += 1;
      } else {
        const startColumn = nextColumn;
        place(child.id, depth + 1);
        const endColumn = nextColumn - 1;
        const center = (startColumn + endColumn) / 2;
        positions[child.id] = { x: center * COLUMN_WIDTH, y: depth * ROW_HEIGHT };
      }
    }
  }

  place(null, 0);
  return positions;
}
