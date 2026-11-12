import type { LearningSource, QuestionNode, StaminaState } from '../workspace-types';

/**
 * Isolated development fixtures for the Workspace UI milestone.
 * This data is hardcoded, not persisted, and not produced by Sarvam — it only
 * exercises the graph/source/trap/stamina components ahead of API wiring.
 */

export const fixtureSource: LearningSource = {
  id: 'src-memory-allocators',
  title: 'Memory Arena Allocators: Design and Trade-offs',
  sourceType: 'transcript',
  sourceReference: 'seed/memory-arena-allocators.txt',
  durationMinutes: 38,
  description:
    'A dense walkthrough of arena/bump allocators, free-list strategies, and the fragmentation ' +
    'trade-offs systems engineers accept when they trade general-purpose malloc for a custom allocator.',
};

export const fixtureSourceBody = `
Arena allocation trades flexibility for throughput. Instead of tracking individual
block metadata the way a general-purpose allocator does, an arena allocator reserves
one contiguous region up front and satisfies allocations by advancing a single
"bump" pointer. Freeing is batched: the whole arena is reset or released at once,
never per-object.

This works well when object lifetimes are correlated — a request handler, a single
frame of a game loop, a parser pass over one file. It works badly when lifetimes are
independent, because there is no way to reclaim an individual object's memory
without invalidating every allocation made after it in the same arena.

A free-list allocator reintroduces per-object reclamation by threading freed blocks
into a linked list keyed by size class, at the cost of metadata overhead and
fragmentation as blocks of mismatched sizes accumulate. Hybrid designs use arenas for
short-lived, correlated allocations and fall back to a general-purpose allocator or a
size-class free list for everything else.

The failure mode to watch for: holding a pointer into an arena past the arena's
reset point. Because the arena's bump pointer is just rewound, the memory is not
zeroed or protected — a stale pointer silently aliases whatever is allocated next,
producing memory-safety bugs that are very difficult to reproduce.
`.trim();

export const fixtureNodes: QuestionNode[] = [
  {
    id: 'node-root',
    parentNodeId: null,
    userQuestion: 'Why would a system choose an arena allocator over malloc at all?',
    aiExplanation:
      'Because a bump-pointer allocation is a handful of instructions with no metadata bookkeeping, ' +
      'while malloc must consult free lists or size-class structures on every call. Arenas also turn an ' +
      'arbitrary number of frees into a single O(1) reset, which matters when allocation lifetimes are ' +
      'correlated with a request, frame, or parse pass.',
    researchMode: false,
    isTrap: false,
    trapMetadata: null,
    trapResolvedAt: null,
    followUps: [
      {
        id: 'fu-root-1',
        position: 1,
        questionText: 'What happens if an object outlives the arena reset?',
        isSelected: true,
        childNodeId: 'node-trap',
      },
      {
        id: 'fu-root-2',
        position: 2,
        questionText: 'How does a hybrid allocator decide what to put in the arena?',
        isSelected: true,
        childNodeId: 'node-research',
      },
      {
        id: 'fu-root-3',
        position: 3,
        questionText: 'Where does fragmentation come from in a free-list design?',
        isSelected: false,
        childNodeId: null,
      },
    ],
    createdAt: '2026-11-10T09:00:00.000Z',
    status: 'ready',
  },
  {
    id: 'node-trap',
    parentNodeId: 'node-root',
    userQuestion: 'If I reset the arena, the old pointers just become invalid and throw, right?',
    aiExplanation:
      'Not quite — that assumption is the trap. The arena does not protect or zero the memory it rewinds ' +
      'over; a stale pointer still reads/writes real, re-allocated memory.',
    researchMode: false,
    isTrap: true,
    trapMetadata: {
      misconceptionType: 'memory_safety',
      scenario:
        'Your request handler caches a pointer into arena-allocated scratch space in a module-level ' +
        'variable "for the next request." The arena is reset at the end of every request. On request 2, ' +
        'the cached pointer is read before being overwritten — explain exactly what is read, and why no ' +
        'exception or crash occurs to warn you.',
      resolutionRequired: true,
    },
    trapResolvedAt: null,
    followUps: [
      { id: 'fu-trap-1', position: 1, questionText: 'How would you detect this with a sanitizer?', isSelected: false, childNodeId: null },
      { id: 'fu-trap-2', position: 2, questionText: 'How do generation-tagged handles fix this?', isSelected: false, childNodeId: null },
      { id: 'fu-trap-3', position: 3, questionText: 'Why doesn’t the OS catch this the way it catches a null deref?', isSelected: false, childNodeId: null },
    ],
    createdAt: '2026-11-10T09:12:00.000Z',
    status: 'ready',
  },
  {
    id: 'node-research',
    parentNodeId: 'node-root',
    userQuestion: 'How does a hybrid allocator decide what to put in the arena?',
    aiExplanation:
      'Research Mode: no direct answer. Start from the lifetime-correlation argument above, then consult ' +
      'the allocation-site literature on escape analysis — what would a compiler need to prove about an ' +
      'allocation for it to be arena-eligible without programmer annotation? Compare against jemalloc’s ' +
      'size-class design docs and derive the trade-off yourself before checking the citation.',
    researchMode: true,
    isTrap: false,
    trapMetadata: null,
    trapResolvedAt: null,
    followUps: [
      { id: 'fu-research-1', position: 1, questionText: 'What would escape analysis need to prove here?', isSelected: false, childNodeId: null },
      { id: 'fu-research-2', position: 2, questionText: 'Where does jemalloc document its size classes?', isSelected: false, childNodeId: null },
      { id: 'fu-research-3', position: 3, questionText: 'What is the Socratic counter-question for a wrong guess?', isSelected: false, childNodeId: null },
    ],
    createdAt: '2026-11-10T09:20:00.000Z',
    status: 'ready',
  },
];

export const fixtureStamina: StaminaState = {
  balance: 410,
  recentTransactions: [
    { id: 'tx-1', eventType: 'node_completed_research_mode', basePoints: 40, multiplier: 3, finalPoints: 120, createdAt: '2026-11-10T09:20:30.000Z' },
    { id: 'tx-2', eventType: 'followup_selected', basePoints: 15, multiplier: 1, finalPoints: 15, createdAt: '2026-11-10T09:12:30.000Z' },
    { id: 'tx-3', eventType: 'inquiry_started', basePoints: 10, multiplier: 1, finalPoints: 10, createdAt: '2026-11-10T09:00:05.000Z' },
  ],
};
