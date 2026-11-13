-- Tattva — Source content and ordered chunks (additive migration).
-- Implements the source data model approved in the Source Data Model proposal:
-- two new tables extending the existing `learning_sources` catalog with raw
-- content storage, processing status tracking, and ordered chunk segmentation.
--
-- This migration is purely additive — it creates new tables and policies only;
-- it does NOT modify `learning_sources` or any existing table/index/policy.
--
-- Source of truth: docs/DATABASE.md §3.6–§3.7 (added alongside this migration).

-- =========================================================================
-- 1. source_content (docs/DATABASE.md §3.6)
-- =========================================================================
create table if not exists public.source_content (
  id uuid primary key default gen_random_uuid(),
  learning_source_id uuid not null
    references public.learning_sources (id) on delete cascade,
  raw_body text not null,
  content_hash text not null,
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processing', 'completed', 'failed')),
  processing_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_content_one_per_source unique (learning_source_id)
);

comment on table public.source_content is
  'Raw content body and processing status for a learning_sources row. 1:1 relationship enforced by UNIQUE(learning_source_id). Written by privileged tooling/seed only — no browser writes (consistent with learning_sources ownership in docs/DATABASE.md §12).';

comment on column public.source_content.content_hash is
  'SHA-256 hex digest of raw_body, for change detection and deduplication.';

comment on column public.source_content.processing_status is
  'State machine: pending → processing → completed | failed. Drives chunk generation.';

-- Index for querying "all content needing processing" (batch operations).
create index if not exists source_content_processing_status_idx
  on public.source_content (processing_status)
  where processing_status in ('pending', 'processing');

-- =========================================================================
-- 2. source_chunks (docs/DATABASE.md §3.7)
-- =========================================================================
create table if not exists public.source_chunks (
  id uuid primary key default gen_random_uuid(),
  source_content_id uuid not null
    references public.source_content (id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  body text not null,
  token_count integer,
  metadata jsonb,
  created_at timestamptz not null default now(),
  constraint source_chunks_unique_position unique (source_content_id, chunk_index)
);

comment on table public.source_chunks is
  'Ordered segments of source_content for AI context windowing. Position is 0-indexed via chunk_index. Written by privileged tooling only.';

comment on column public.source_chunks.token_count is
  'Estimated token count for the chunk body. Nullable — not all processing strategies compute this immediately.';

comment on column public.source_chunks.metadata is
  'Flexible structural metadata (e.g. heading, timestamp range). Shape depends on source_type; not frozen yet.';

-- =========================================================================
-- 3. Row Level Security
-- =========================================================================
alter table public.source_content enable row level security;
alter table public.source_chunks enable row level security;

-- source_content: read-only for any authenticated user (mirrors learning_sources).
-- No insert/update/delete policy — curated content is written via privileged
-- tooling only, consistent with learning_sources RLS (docs/DATABASE.md §10).
drop policy if exists source_content_select_authenticated on public.source_content;
create policy source_content_select_authenticated
  on public.source_content
  for select
  to authenticated
  using (true);

-- source_chunks: read-only for any authenticated user.
drop policy if exists source_chunks_select_authenticated on public.source_chunks;
create policy source_chunks_select_authenticated
  on public.source_chunks
  for select
  to authenticated
  using (true);

