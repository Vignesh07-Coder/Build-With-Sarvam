import { createInquiry, getMe, listInquiries } from './api-client';
import { getAccessToken } from './auth';

/**
 * The seeded `learning_sources` row id (supabase/seed.sql) backing the
 * hackathon's single curated demo source. The Knowledge Graph itself still
 * renders from apps/web/lib/fixtures/workspace-fixtures.ts (Sarvam
 * integration is a later milestone — CLAUDE.md §2) but the inquiry that
 * "owns" this session must be a real, persistent row (Stage 5 objective).
 */
export const DEMO_LEARNING_SOURCE_ID = '11111111-1111-4111-8111-111111111111';

export interface DemoInquirySession {
  inquiryId: string;
  userId: string;
  isAnonymous: boolean;
}

/**
 * Establishes an authenticated anonymous session (ADR-002) and ensures a
 * real `inquiries` row exists for this browser's demo source — reusing one
 * if this identity already created it, rather than creating a new row on
 * every reload.
 */
export async function ensureDemoInquiry(): Promise<DemoInquirySession> {
  await getAccessToken();
  const me = await getMe();

  const existing = await listInquiries();
  const match = existing.data.find((inquiry) => inquiry.learningSourceId === DEMO_LEARNING_SOURCE_ID);

  if (match) {
    return { inquiryId: match.id, userId: me.data.user.id, isAnonymous: me.data.user.isAnonymous };
  }

  const created = await createInquiry(DEMO_LEARNING_SOURCE_ID);
  return { inquiryId: created.data.id, userId: me.data.user.id, isAnonymous: me.data.user.isAnonymous };
}
