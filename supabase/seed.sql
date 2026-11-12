-- Tattva local development seed data.
--
-- Run automatically by `supabase db reset` (see docs/development-setup.md).
-- Seeds the curated `learning_sources` row used by the Golden Path demo
-- (docs/ARCHITECTURE.md §10.1) — the same material already used as a
-- frontend fixture in apps/web/lib/fixtures/workspace-fixtures.ts, now
-- persisted for real. Safe to rerun: a fixed id + ON CONFLICT upsert means
-- `supabase db reset` never duplicates this row.

insert into public.learning_sources (id, title, description, source_type, duration_minutes, source_reference, published_at)
values (
  '11111111-1111-4111-8111-111111111111',
  'Memory Arena Allocators: Design and Trade-offs',
  'A dense walkthrough of arena/bump allocators, free-list strategies, and the fragmentation trade-offs systems engineers accept when they trade general-purpose malloc for a custom allocator.',
  'transcript',
  38,
  'seed/memory-arena-allocators.txt',
  now()
)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  source_type = excluded.source_type,
  duration_minutes = excluded.duration_minutes,
  source_reference = excluded.source_reference;
