import type { Inquiry, InquiryDetail } from '@tattva/contracts';
import { createRequestScopedClient } from '../integrations/supabase/client';
import { ApiError } from '../types/api';
import { findLearningSourceById } from '../repositories/learningSourceRepository';
import {
  createInquiry as createInquiryRow,
  findInquiryByIdForUser,
  listInquiriesForUser,
} from '../repositories/inquiryRepository';
import { listNodesForInquiry } from '../repositories/questionNodeRepository';

/**
 * Inquiry service (docs/ARCHITECTURE.md §3). Owns ownership checks and
 * cross-entity assembly; controllers never touch repositories directly.
 */
export async function createInquiryForUser(
  accessToken: string,
  userId: string,
  learningSourceId: string,
): Promise<Inquiry> {
  const client = createRequestScopedClient(accessToken);

  const source = await findLearningSourceById(client, learningSourceId);
  if (!source) {
    throw new ApiError(404, 'learning_source_not_found', 'The referenced learning source does not exist');
  }

  return createInquiryRow(client, userId, learningSourceId);
}

export async function listInquiries(accessToken: string, userId: string): Promise<Inquiry[]> {
  const client = createRequestScopedClient(accessToken);
  return listInquiriesForUser(client, userId);
}

export async function getInquiryDetail(
  accessToken: string,
  userId: string,
  inquiryId: string,
): Promise<InquiryDetail> {
  const client = createRequestScopedClient(accessToken);

  const inquiry = await findInquiryByIdForUser(client, inquiryId, userId);
  if (!inquiry || inquiry.userId !== userId) {
    // 404, not 403: do not leak existence of another user's resource (docs/ARCHITECTURE.md §7.1).
    throw new ApiError(404, 'inquiry_not_found', 'Inquiry not found');
  }

  const source = await findLearningSourceById(client, inquiry.learningSourceId);
  if (!source) {
    throw new ApiError(404, 'learning_source_not_found', 'The inquiry references a missing learning source');
  }

  const nodes = await listNodesForInquiry(client, inquiry.id);

  return { id: inquiry.id, learningSource: source, nodes };
}
