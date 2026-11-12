import type { SupabaseClient } from '@supabase/supabase-js';
import type { Inquiry } from '@tattva/contracts';

interface InquiryRow {
  id: string;
  user_id: string;
  learning_source_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: InquiryRow): Inquiry {
  return {
    id: row.id,
    userId: row.user_id,
    learningSourceId: row.learning_source_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * `inquiries` data access (docs/DATABASE.md §3.2). All operations use the
 * request-scoped (RLS-protected) client — `user_id` is implicit from the
 * verified caller's token via RLS, and every read is additionally filtered
 * by `user_id` in application code as the documented second authorization
 * layer (docs/ARCHITECTURE.md §6.2).
 */
export async function createInquiry(
  client: SupabaseClient,
  userId: string,
  learningSourceId: string,
): Promise<Inquiry> {
  const { data, error } = await client
    .from('inquiries')
    .insert({ user_id: userId, learning_source_id: learningSourceId })
    .select('id, user_id, learning_source_id, title, created_at, updated_at')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create inquiry: ${error?.message ?? 'unknown error'}`);
  }

  return mapRow(data);
}

export async function listInquiriesForUser(client: SupabaseClient, userId: string): Promise<Inquiry[]> {
  const { data, error } = await client
    .from('inquiries')
    .select('id, user_id, learning_source_id, title, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list inquiries for user ${userId}: ${error.message}`);
  }

  return (data ?? []).map(mapRow);
}

export async function findInquiryByIdForUser(
  client: SupabaseClient,
  inquiryId: string,
  userId: string,
): Promise<Inquiry | null> {
  const { data, error } = await client
    .from('inquiries')
    .select('id, user_id, learning_source_id, title, created_at, updated_at')
    .eq('id', inquiryId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load inquiry ${inquiryId}: ${error.message}`);
  }

  return data ? mapRow(data) : null;
}
