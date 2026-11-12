import type { Request, Response } from 'express';
import {
  createInquiryRequestSchema,
  inquiryIdParamsSchema,
  type CreateInquiryResponse,
  type GetInquiryResponse,
  type ListInquiriesResponse,
} from '@tattva/contracts';
import { ApiError } from '../types/api';
import { createInquiryForUser, getInquiryDetail, listInquiries } from '../services/inquiryService';

/**
 * Controllers for the inquiry endpoints (docs/API_CONTRACTS.md §2, §3, and
 * the list endpoint documented as an addition in Stage 5 — see that doc's
 * note). Thin: validate, call the service, shape the response.
 */
export async function postInquiry(req: Request, res: Response<CreateInquiryResponse>): Promise<void> {
  if (!req.auth) throw new ApiError(401, 'missing_token', 'Authentication required');

  const body = createInquiryRequestSchema.parse(req.body);
  const inquiry = await createInquiryForUser(req.auth.accessToken, req.auth.userId, body.learningSourceId);

  res.status(201).json({ data: inquiry });
}

export async function getInquiries(req: Request, res: Response<ListInquiriesResponse>): Promise<void> {
  if (!req.auth) throw new ApiError(401, 'missing_token', 'Authentication required');

  const inquiries = await listInquiries(req.auth.accessToken, req.auth.userId);
  res.status(200).json({ data: inquiries });
}

export async function getInquiry(req: Request, res: Response<GetInquiryResponse>): Promise<void> {
  if (!req.auth) throw new ApiError(401, 'missing_token', 'Authentication required');

  const { inquiryId } = inquiryIdParamsSchema.parse(req.params);

  const detail = await getInquiryDetail(req.auth.accessToken, req.auth.userId, inquiryId);
  res.status(200).json({ data: detail });
}
