import type { SupabaseClient } from '@supabase/supabase-js';
import type { FollowUpQuestion, QuestionNode, TrapMetadata } from '@tattva/contracts';

interface FollowUpRow {
  id: string;
  position: 1 | 2 | 3;
  question_text: string;
  is_selected: boolean;
  child_node_id: string | null;
}

interface QuestionNodeRow {
  id: string;
  parent_node_id: string | null;
  user_question: string;
  ai_explanation: string;
  research_mode: boolean;
  is_trap: boolean;
  trap_metadata: TrapMetadata | null;
  trap_resolved_at: string | null;
  created_at: string;
  follow_up_questions: FollowUpRow[];
}

function mapFollowUp(row: FollowUpRow): FollowUpQuestion {
  return {
    id: row.id,
    position: row.position,
    questionText: row.question_text,
    isSelected: row.is_selected,
    childNodeId: row.child_node_id,
  };
}

function mapNode(row: QuestionNodeRow): QuestionNode {
  return {
    id: row.id,
    parentNodeId: row.parent_node_id,
    userQuestion: row.user_question,
    aiExplanation: row.ai_explanation,
    researchMode: row.research_mode,
    isTrap: row.is_trap,
    trapMetadata: row.trap_metadata,
    trapResolvedAt: row.trap_resolved_at,
    followUps: (row.follow_up_questions ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(mapFollowUp),
    createdAt: row.created_at,
  };
}

/**
 * Read-only access to `question_nodes` + `follow_up_questions` for the
 * inquiry detail endpoint (docs/API_CONTRACTS.md §3, docs/DATABASE.md §3.3/
 * §3.4). No node-creation path exists yet in Stage 5 — this repository is
 * read-only until the Sarvam-integration milestone adds writes.
 */
export async function listNodesForInquiry(client: SupabaseClient, inquiryId: string): Promise<QuestionNode[]> {
  const { data, error } = await client
    .from('question_nodes')
    .select(
      // follow_up_questions has two FKs into question_nodes (question_node_id
      // and child_node_id); the !question_node_id hint tells PostgREST which
      // one to embed here — without it, the query 500s with "more than one
      // relationship was found" (caught live against the real database).
      'id, parent_node_id, user_question, ai_explanation, research_mode, is_trap, trap_metadata, trap_resolved_at, created_at, follow_up_questions!question_node_id(id, position, question_text, is_selected, child_node_id)',
    )
    .eq('inquiry_id', inquiryId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to load nodes for inquiry ${inquiryId}: ${error.message}`);
  }

  return (data ?? []).map((row) => mapNode(row as unknown as QuestionNodeRow));
}
