import { z } from 'zod';
import { learningSourceSummarySchema } from './learning-source';
import { questionNodeSchema } from './question-node';

/**
 * Contracts for the inquiry endpoints (docs/API_CONTRACTS.md §2, §3, and the
 * list endpoint added in Stage 5 — see that doc's changelog note). The
 * success envelope wraps every payload in `{ data: ... }` per §0.
 */
export const createInquiryRequestSchema = z.object({
  learningSourceId: z.string().uuid(),
});

export type CreateInquiryRequest = z.infer<typeof createInquiryRequestSchema>;

export const inquirySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  learningSourceId: z.string().uuid(),
  title: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Inquiry = z.infer<typeof inquirySchema>;

export const createInquiryResponseSchema = z.object({
  data: inquirySchema,
});

export type CreateInquiryResponse = z.infer<typeof createInquiryResponseSchema>;

export const listInquiriesResponseSchema = z.object({
  data: z.array(inquirySchema),
});

export type ListInquiriesResponse = z.infer<typeof listInquiriesResponseSchema>;

export const inquiryDetailSchema = z.object({
  id: z.string().uuid(),
  learningSource: learningSourceSummarySchema,
  nodes: z.array(questionNodeSchema),
});

export type InquiryDetail = z.infer<typeof inquiryDetailSchema>;

export const getInquiryResponseSchema = z.object({
  data: inquiryDetailSchema,
});

export type GetInquiryResponse = z.infer<typeof getInquiryResponseSchema>;

export const inquiryIdParamsSchema = z.object({
  inquiryId: z.string().uuid(),
});
