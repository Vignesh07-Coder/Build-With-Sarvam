import { z } from 'zod';

/**
 * Internal schemas for RAW Sarvam model output, as extracted by parser.ts
 * from the validated plain-text labelled-line format (docs/PROMPT_DESIGN.md
 * §4, Stage 6B/6B.1 benchmark). These are deliberately a different shape
 * from `@tattva/contracts`'s `questionNodeSchema`/`followUpQuestionSchema`
 * (packages/contracts/src/question-node.ts), which describe the *persisted*
 * node shape. Mapping raw model output into the persisted shape is a future
 * node-orchestration concern — not this adapter's — so the two schema
 * families must stay separate rather than being unified here.
 */

export const misconceptionTypeSchema = z.enum([
  'incorrect_assumption',
  'incomplete_mental_model',
  'invalid_generalization',
  'incorrect_causal_relationship',
  'edge_case_misunderstanding',
]);
export type MisconceptionType = z.infer<typeof misconceptionTypeSchema>;

export const misconceptionConfidenceSchema = z.enum(['low', 'medium', 'high']);
export type MisconceptionConfidence = z.infer<typeof misconceptionConfidenceSchema>;

export const misconceptionAssessmentSchema = z.object({
  type: misconceptionTypeSchema,
  confidence: misconceptionConfidenceSchema,
  description: z.string().min(1),
});
export type MisconceptionAssessment = z.infer<typeof misconceptionAssessmentSchema>;

/**
 * Raw standard-mode output. `falsePremiseQuote`/`misconception`/`trap` are
 * `null` when the model wrote the literal sentinel "none" for that label.
 *
 * The refine below enforces only the model's *internal self-consistency*
 * (CONFIDENCE=high must come with a quote at all) — it is NOT the
 * ground-truth check against the student's actual question. That
 * independent check lives in falsePremiseVerification.ts and must never be
 * collapsed into this schema, per the task's "do not trust the model's
 * confidence field by itself" requirement.
 */
export const sarvamStandardRawResponseSchema = z
  .object({
    explanation: z.string().min(1),
    followUps: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
    falsePremiseQuote: z.string().min(1).nullable(),
    misconception: misconceptionAssessmentSchema.nullable(),
    trap: z.string().min(1).nullable(),
  })
  .refine(
    (data) => {
      if (data.misconception?.confidence !== 'high') return true;
      return data.falsePremiseQuote !== null;
    },
    {
      message: 'CONFIDENCE=high requires a non-"none" FALSE_PREMISE_QUOTE',
      path: ['falsePremiseQuote'],
    },
  );
export type SarvamStandardRawResponse = z.infer<typeof sarvamStandardRawResponseSchema>;

export const sarvamResearchModeRawResponseSchema = z.object({
  socraticQuestions: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
  followUps: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
  references: z.string().min(1).nullable(),
});
export type SarvamResearchModeRawResponse = z.infer<typeof sarvamResearchModeRawResponseSchema>;
