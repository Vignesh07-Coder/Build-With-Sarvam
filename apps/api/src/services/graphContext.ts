import type { SupabaseClient } from '@supabase/supabase-js';
import { findNodeById, type AncestorNodeRow } from '../repositories/questionNodeRepository';

/**
 * Bounded learning-history context builder (docs/INTELLIGENCE_ARCHITECTURE.md
 * §3). Assembles, from already-persisted `question_nodes` rows, the context
 * a future node-orchestration service hands to the Sarvam adapter when
 * generating the NEXT node in a branch — this module never calls Sarvam and
 * never writes anything; it only reads.
 *
 * Bounded-context design (per the architecture doc's own table):
 * - Immediate parent and grandparent are included verbatim (truncated).
 * - Anything older than the grandparent is folded into a single, bounded
 *   "older ancestry" digest instead of being sent verbatim — the doc marks
 *   whether this digest is LLM-generated-and-persisted or recomputed as
 *   Pending, and proposes "recompute" as the hackathon default since no
 *   persisted-summary column or generation mechanism exists yet. This
 *   module implements that recompute path only: a deterministic,
 *   non-generative truncate-and-concatenate digest built from the already
 *   fetched rows, never an LLM-produced synthesis (this module must not call
 *   Sarvam, per the architecture doc's own module boundary table in §8).
 */

export class GraphContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphContextError';
  }
}

export interface AncestorContext {
  nodeId: string;
  question: string;
  explanation: string;
}

export interface GraphContext {
  /** Depth the node-about-to-be-created will occupy: 0 for a root node, 1 for a child, 2 for a grandchild, 3+ beyond. */
  depth: number;
  parent: AncestorContext | null;
  grandparent: AncestorContext | null;
  /** Bounded digest of ancestry older than the grandparent; null unless depth >= 3. */
  olderAncestrySummary: string | null;
}

export interface BuildGraphContextParams {
  /** The inquiry the new node will belong to — every ancestor must belong to this same inquiry. */
  inquiryId: string;
  /** The node the student is branching from, or null for a root-level question. */
  parentNodeId: string | null;
}

// INTELLIGENCE_ARCHITECTURE.md §3: "~1,500 chars" proposed cap for verbatim parent/grandparent context.
const VERBATIM_EXPLANATION_CHAR_CAP = 1500;

// Keeps the older-ancestry digest itself bounded (a "single rolling one-paragraph synthesis", §3).
const OLDER_ANCESTRY_SUMMARY_CHAR_CAP = 1000;
const OLDER_ANCESTRY_PER_NODE_CHAR_CAP = 200;

// Defensive bound on ancestry traversal: real hackathon sessions won't approach this depth (PRD's
// "10+ levels deep" figure is well under it). This exists to guarantee the walk terminates even
// against corrupted data, not to cap any legitimate learning journey.
const MAX_ANCESTRY_TRAVERSAL = 50;

function truncate(text: string, cap: number): string {
  if (text.length <= cap) return text;
  return `${text.slice(0, cap - 1).trimEnd()}…`;
}

function toAncestorContext(row: AncestorNodeRow): AncestorContext {
  return {
    nodeId: row.id,
    question: row.userQuestion,
    explanation: truncate(row.aiExplanation, VERBATIM_EXPLANATION_CHAR_CAP),
  };
}

/** Builds the bounded digest for ancestry older than the grandparent, oldest-first (chronological). */
function buildOlderAncestrySummary(olderRowsNearestFirst: AncestorNodeRow[]): string {
  const chronological = [...olderRowsNearestFirst].reverse();

  let summary = '';
  for (const row of chronological) {
    const question = truncate(row.userQuestion, OLDER_ANCESTRY_PER_NODE_CHAR_CAP);
    const explanation = truncate(row.aiExplanation, OLDER_ANCESTRY_PER_NODE_CHAR_CAP);
    const entry = `Q: ${question} A: ${explanation}`;
    const candidate = summary ? `${summary} | ${entry}` : entry;
    if (candidate.length > OLDER_ANCESTRY_SUMMARY_CHAR_CAP) break;
    summary = candidate;
  }

  return summary;
}

/**
 * Walks `parent_node_id` upward one row at a time, starting from
 * `parentNodeId`, stopping at the root. Bounded by construction: one DB
 * read per ancestor (never a whole-inquiry fetch), a hard traversal cap
 * (`MAX_ANCESTRY_TRAVERSAL`), and cycle detection via a visited-set so a
 * corrupted/cyclic `parent_node_id` chain fails loudly instead of looping
 * forever.
 */
async function walkAncestry(client: SupabaseClient, inquiryId: string, parentNodeId: string): Promise<AncestorNodeRow[]> {
  const chain: AncestorNodeRow[] = [];
  const visited = new Set<string>();

  let currentId: string | null = parentNodeId;

  while (currentId) {
    if (visited.has(currentId)) {
      throw new GraphContextError(`Cyclic ancestry detected: node ${currentId} is its own ancestor`);
    }
    if (chain.length >= MAX_ANCESTRY_TRAVERSAL) {
      break;
    }
    visited.add(currentId);

    const row = await findNodeById(client, currentId);
    if (!row) {
      throw new GraphContextError(`Invalid ancestry: referenced parent node ${currentId} does not exist`);
    }
    if (row.inquiryId !== inquiryId) {
      throw new GraphContextError(`Invalid ancestry: node ${currentId} does not belong to inquiry ${inquiryId}`);
    }

    chain.push(row);
    currentId = row.parentNodeId;
  }

  return chain;
}

/**
 * Builds bounded graph context for the node about to be generated.
 *
 * `client` must be the caller's request-scoped (RLS-protected) Supabase
 * client — ownership is enforced both by RLS on the underlying query and,
 * as defense in depth, by the explicit `inquiryId` check on every fetched
 * ancestor (docs/ARCHITECTURE.md §6.2).
 */
export async function buildGraphContext(client: SupabaseClient, params: BuildGraphContextParams): Promise<GraphContext> {
  const { inquiryId, parentNodeId } = params;

  if (!parentNodeId) {
    return { depth: 0, parent: null, grandparent: null, olderAncestrySummary: null };
  }

  const chain = await walkAncestry(client, inquiryId, parentNodeId);
  const [parentRow, grandparentRow, ...olderRows] = chain;

  return {
    depth: chain.length,
    parent: parentRow ? toAncestorContext(parentRow) : null,
    grandparent: grandparentRow ? toAncestorContext(grandparentRow) : null,
    olderAncestrySummary: olderRows.length > 0 ? buildOlderAncestrySummary(olderRows) : null,
  };
}
