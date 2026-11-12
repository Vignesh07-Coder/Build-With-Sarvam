import type { SupabaseClient } from '@supabase/supabase-js';
import type { LearningSourceSummary } from '@tattva/contracts';

interface LearningSourceRow {
  id: string;
  title: string;
  source_type: 'video' | 'document' | 'transcript';
  source_reference: string;
  duration_minutes: number;
}

function mapRow(row: LearningSourceRow): LearningSourceSummary {
  return {
    id: row.id,
    title: row.title,
    sourceType: row.source_type,
    sourceReference: row.source_reference,
    durationMinutes: row.duration_minutes,
  };
}

/**
 * Read-only access to `learning_sources` (docs/DATABASE.md §3.1). The
 * hackathon MVP never inserts/updates this table from `apps/api` — curated
 * rows are seeded only (docs/DATABASE.md §12).
 */
export async function findLearningSourceById(
  client: SupabaseClient,
  id: string,
): Promise<LearningSourceSummary | null> {
  const { data, error } = await client
    .from('learning_sources')
    .select('id, title, source_type, source_reference, duration_minutes')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load learning source ${id}: ${error.message}`);
  }

  return data ? mapRow(data) : null;
}
