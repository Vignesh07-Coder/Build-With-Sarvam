import { z } from 'zod';

/**
 * Contracts for `question_nodes` / `follow_up_questions` as embedded in
 * GET /api/v1/inquiries/:inquiryId (docs/API_CONTRACTS.md §3,
 * docs/DATABASE.md §3.3/§3.4). Stage 5 only reads these tables (via the
 * inquiry detail endpoint) — no node-creation endpoint exists yet; that is
 * explicitly deferred to the Sarvam-integration milestone.
 */
export const trapMetadataSchema = z.object({
  misconceptionType: z.string(),
  scenario: z.string(),
  resolutionRequired: z.boolean(),
});

export const followUpQuestionSchema = z.object({
  id: z.string().uuid(),
  position: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  questionText: z.string(),
  isSelected: z.boolean(),
  childNodeId: z.string().uuid().nullable(),
});

export const questionNodeSchema = z.object({
  id: z.string().uuid(),
  parentNodeId: z.string().uuid().nullable(),
  userQuestion: z.string(),
  aiExplanation: z.string(),
  researchMode: z.boolean(),
  isTrap: z.boolean(),
  trapMetadata: trapMetadataSchema.nullable(),
  trapResolvedAt: z.string().nullable(),
  followUps: z.array(followUpQuestionSchema),
  createdAt: z.string(),
});

export type TrapMetadata = z.infer<typeof trapMetadataSchema>;
export type FollowUpQuestion = z.infer<typeof followUpQuestionSchema>;
export type QuestionNode = z.infer<typeof questionNodeSchema>;
