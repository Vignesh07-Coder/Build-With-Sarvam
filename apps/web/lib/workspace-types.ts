/**
 * UI-local shapes for the Workspace, mirrored from docs/API_CONTRACTS.md and
 * docs/DATABASE.md so the graph/composer/trap/stamina components can be wired
 * to the real API later without a reshape. These are not re-exported from
 * packages/contracts because the backend contracts package does not yet
 * define the inquiry/question-node domain schemas (health-check only).
 */

export type SourceType = 'video' | 'document' | 'transcript';

export interface LearningSource {
  id: string;
  title: string;
  sourceType: SourceType;
  sourceReference: string;
  durationMinutes: number;
  description: string;
}

export interface FollowUpQuestion {
  id: string;
  position: 1 | 2 | 3;
  questionText: string;
  isSelected: boolean;
  childNodeId: string | null;
}

export interface TrapMetadata {
  misconceptionType: string;
  scenario: string;
  resolutionRequired: boolean;
}

/** Client-only rendering status; not part of the API response shape. */
export type NodeRenderStatus = 'ready' | 'pending' | 'error';

export interface QuestionNode {
  id: string;
  parentNodeId: string | null;
  userQuestion: string;
  aiExplanation: string;
  researchMode: boolean;
  isTrap: boolean;
  trapMetadata: TrapMetadata | null;
  trapResolvedAt: string | null;
  followUps: FollowUpQuestion[];
  createdAt: string;
  status: NodeRenderStatus;
}

export type StaminaEventType =
  | 'inquiry_started'
  | 'followup_selected'
  | 'trap_survived'
  | 'node_completed_research_mode';

export interface StaminaTransaction {
  id: string;
  eventType: StaminaEventType;
  basePoints: number;
  multiplier: number;
  finalPoints: number;
  createdAt: string;
}

export interface StaminaState {
  balance: number;
  recentTransactions: StaminaTransaction[];
}

export type TrapSubmissionState = 'idle' | 'submitting' | 'submitted';
