import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findNodeById } = vi.hoisted(() => ({ findNodeById: vi.fn() }));

vi.mock('../repositories/questionNodeRepository', () => ({ findNodeById }));

import { buildGraphContext, GraphContextError } from './graphContext';

const INQUIRY_ID = 'inquiry-1';
const CLIENT = {} as never;

function node(overrides: Partial<{ id: string; parentNodeId: string | null; userQuestion: string; aiExplanation: string; inquiryId: string }>) {
  return {
    id: 'node-id',
    inquiryId: INQUIRY_ID,
    parentNodeId: null,
    userQuestion: 'question',
    aiExplanation: 'explanation',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildGraphContext', () => {
  it('returns root-level context with no ancestors when parentNodeId is null', async () => {
    const result = await buildGraphContext(CLIENT, { inquiryId: INQUIRY_ID, parentNodeId: null });

    expect(result).toEqual({ depth: 0, parent: null, grandparent: null, olderAncestrySummary: null });
    expect(findNodeById).not.toHaveBeenCalled();
  });

  it('builds context for a child node (parent only, no grandparent)', async () => {
    findNodeById.mockResolvedValueOnce(
      node({ id: 'root', parentNodeId: null, userQuestion: 'What is an arena allocator?', aiExplanation: 'It bumps a pointer.' }),
    );

    const result = await buildGraphContext(CLIENT, { inquiryId: INQUIRY_ID, parentNodeId: 'root' });

    expect(result.depth).toBe(1);
    expect(result.parent).toEqual({ nodeId: 'root', question: 'What is an arena allocator?', explanation: 'It bumps a pointer.' });
    expect(result.grandparent).toBeNull();
    expect(result.olderAncestrySummary).toBeNull();
    expect(findNodeById).toHaveBeenCalledTimes(1);
  });

  it('builds context for a grandchild node (parent + grandparent, no older ancestry)', async () => {
    findNodeById
      .mockResolvedValueOnce(node({ id: 'parent', parentNodeId: 'grandparent', userQuestion: 'Q-parent', aiExplanation: 'A-parent' }))
      .mockResolvedValueOnce(node({ id: 'grandparent', parentNodeId: null, userQuestion: 'Q-root', aiExplanation: 'A-root' }));

    const result = await buildGraphContext(CLIENT, { inquiryId: INQUIRY_ID, parentNodeId: 'parent' });

    expect(result.depth).toBe(2);
    expect(result.parent?.nodeId).toBe('parent');
    expect(result.grandparent?.nodeId).toBe('grandparent');
    expect(result.olderAncestrySummary).toBeNull();
  });

  it('produces a bounded older-ancestry summary at depth 3', async () => {
    findNodeById
      .mockResolvedValueOnce(node({ id: 'parent', parentNodeId: 'grandparent' }))
      .mockResolvedValueOnce(node({ id: 'grandparent', parentNodeId: 'great-grandparent' }))
      .mockResolvedValueOnce(
        node({ id: 'great-grandparent', parentNodeId: null, userQuestion: 'root question', aiExplanation: 'root explanation' }),
      );

    const result = await buildGraphContext(CLIENT, { inquiryId: INQUIRY_ID, parentNodeId: 'parent' });

    expect(result.depth).toBe(3);
    expect(result.parent?.nodeId).toBe('parent');
    expect(result.grandparent?.nodeId).toBe('grandparent');
    expect(result.olderAncestrySummary).toContain('root question');
    expect(result.olderAncestrySummary).toContain('root explanation');
  });

  it('bounds and orders a deeper ancestry chain chronologically (oldest first) in the rolling summary', async () => {
    findNodeById
      .mockResolvedValueOnce(node({ id: 'parent', parentNodeId: 'grandparent' }))
      .mockResolvedValueOnce(node({ id: 'grandparent', parentNodeId: 'older-1' }))
      .mockResolvedValueOnce(node({ id: 'older-1', parentNodeId: 'older-2', userQuestion: 'older-1 question' }))
      .mockResolvedValueOnce(node({ id: 'older-2', parentNodeId: null, userQuestion: 'root question' }));

    const result = await buildGraphContext(CLIENT, { inquiryId: INQUIRY_ID, parentNodeId: 'parent' });

    expect(result.depth).toBe(4);
    const rootIndex = result.olderAncestrySummary?.indexOf('root question') ?? -1;
    const older1Index = result.olderAncestrySummary?.indexOf('older-1 question') ?? -1;
    expect(rootIndex).toBeGreaterThanOrEqual(0);
    expect(older1Index).toBeGreaterThan(rootIndex);
  });

  it('rejects when the parent node does not exist', async () => {
    findNodeById.mockResolvedValueOnce(null);

    await expect(buildGraphContext(CLIENT, { inquiryId: INQUIRY_ID, parentNodeId: 'missing' })).rejects.toThrow(GraphContextError);
  });

  it('rejects when the grandparent reference points to a missing node', async () => {
    findNodeById.mockResolvedValueOnce(node({ id: 'parent', parentNodeId: 'missing-grandparent' })).mockResolvedValueOnce(null);

    await expect(buildGraphContext(CLIENT, { inquiryId: INQUIRY_ID, parentNodeId: 'parent' })).rejects.toThrow(GraphContextError);
  });

  it('rejects a cyclic ancestry chain instead of looping forever', async () => {
    findNodeById
      .mockResolvedValueOnce(node({ id: 'a', parentNodeId: 'b' }))
      .mockResolvedValueOnce(node({ id: 'b', parentNodeId: 'a' }));

    await expect(buildGraphContext(CLIENT, { inquiryId: INQUIRY_ID, parentNodeId: 'a' })).rejects.toThrow(/Cyclic ancestry/);
  });

  it('rejects an ancestor that belongs to a different inquiry (ownership violation)', async () => {
    findNodeById.mockResolvedValueOnce(node({ id: 'parent', inquiryId: 'someone-elses-inquiry' }));

    await expect(buildGraphContext(CLIENT, { inquiryId: INQUIRY_ID, parentNodeId: 'parent' })).rejects.toThrow(/does not belong to inquiry/);
  });

  it('handles an empty explanation on an ancestor without crashing', async () => {
    findNodeById.mockResolvedValueOnce(node({ id: 'parent', parentNodeId: null, aiExplanation: '' }));

    const result = await buildGraphContext(CLIENT, { inquiryId: INQUIRY_ID, parentNodeId: 'parent' });

    expect(result.parent?.explanation).toBe('');
  });

  it('truncates a verbatim parent/grandparent explanation longer than the character cap', async () => {
    const longExplanation = 'x'.repeat(2000);
    findNodeById.mockResolvedValueOnce(node({ id: 'parent', parentNodeId: null, aiExplanation: longExplanation }));

    const result = await buildGraphContext(CLIENT, { inquiryId: INQUIRY_ID, parentNodeId: 'parent' });

    expect(result.parent?.explanation.length).toBeLessThan(longExplanation.length);
  });

  it('performs exactly one bounded DB read per ancestor, never a whole-inquiry fetch', async () => {
    findNodeById
      .mockResolvedValueOnce(node({ id: 'parent', parentNodeId: 'grandparent' }))
      .mockResolvedValueOnce(node({ id: 'grandparent', parentNodeId: null }));

    await buildGraphContext(CLIENT, { inquiryId: INQUIRY_ID, parentNodeId: 'parent' });

    expect(findNodeById).toHaveBeenCalledTimes(2);
    expect(findNodeById).toHaveBeenNthCalledWith(1, CLIENT, 'parent');
    expect(findNodeById).toHaveBeenNthCalledWith(2, CLIENT, 'grandparent');
  });

  it('stops traversal at the defensive depth bound rather than looping unboundedly on a very deep chain', async () => {
    const depth = 60;
    for (let i = 0; i < depth; i += 1) {
      const id = `n${i}`;
      const parentId = i + 1 < depth ? `n${i + 1}` : null;
      findNodeById.mockResolvedValueOnce(node({ id, parentNodeId: parentId }));
    }

    const result = await buildGraphContext(CLIENT, { inquiryId: INQUIRY_ID, parentNodeId: 'n0' });

    expect(result.depth).toBeLessThan(depth);
    expect(findNodeById.mock.calls.length).toBeLessThan(depth);
  });
});
