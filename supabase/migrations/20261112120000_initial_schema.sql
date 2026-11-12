-- Tattva Stage 5 — initial domain schema.
-- Implements the five entities documented in docs/DATABASE.md and the
-- decisions recorded in docs/decisions/ADR-003-database-model.md.
-- Source of truth for naming/constraints is docs/DATABASE.md; this file is
-- the versioned implementation of that design, not an independent design.

-- =========================================================================
-- 1. learning_sources (docs/DATABASE.md §3.1)
-- =========================================================================
create table if not exists public.learning_sources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  source_type text not null check (source_type in ('video', 'document', 'transcript')),
  duration_minutes integer not null check (duration_minutes >= 25),
  source_reference text not null,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.learning_sources is
  'Curated technical learning material. Seeded only — no browser/API writes (docs/DATABASE.md §12).';

-- =========================================================================
-- 2. inquiries (docs/DATABASE.md §3.2)
-- =========================================================================
create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  learning_source_id uuid not null references public.learning_sources (id) on delete restrict,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inquiries_user_id_idx on public.inquiries (user_id);
create index if not exists inquiries_user_id_created_at_idx on public.inquiries (user_id, created_at desc);

-- =========================================================================
-- 3. question_nodes (docs/DATABASE.md §3.3)
-- =========================================================================
create table if not exists public.question_nodes (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  parent_node_id uuid references public.question_nodes (id) on delete cascade,
  user_question text not null,
  ai_explanation text not null,
  research_mode boolean not null default false,
  is_trap boolean not null default false,
  trap_metadata jsonb,
  trap_resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint question_nodes_no_self_parent check (parent_node_id is null or parent_node_id <> id)
);

create index if not exists question_nodes_inquiry_id_idx on public.question_nodes (inquiry_id);
create index if not exists question_nodes_parent_node_id_idx on public.question_nodes (parent_node_id);
create unique index if not exists question_nodes_one_root_per_inquiry_idx
  on public.question_nodes (inquiry_id)
  where parent_node_id is null;

comment on index public.question_nodes_one_root_per_inquiry_idx is
  'Enforces exactly one root node per inquiry at the database level, belt-and-suspenders alongside the service-layer sequencing rule in docs/DATABASE.md §3.3.';

-- =========================================================================
-- 4. follow_up_questions (docs/DATABASE.md §3.4)
-- =========================================================================
create table if not exists public.follow_up_questions (
  id uuid primary key default gen_random_uuid(),
  question_node_id uuid not null references public.question_nodes (id) on delete cascade,
  position smallint not null check (position in (1, 2, 3)),
  question_text text not null,
  is_selected boolean not null default false,
  child_node_id uuid references public.question_nodes (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint follow_up_questions_unique_position unique (question_node_id, position)
);

create index if not exists follow_up_questions_question_node_id_idx on public.follow_up_questions (question_node_id);

-- =========================================================================
-- 5. wallet_transactions (docs/DATABASE.md §3.5) — append-only ledger
-- =========================================================================
create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  inquiry_id uuid references public.inquiries (id) on delete set null,
  question_node_id uuid references public.question_nodes (id) on delete set null,
  event_type text not null,
  base_points integer not null check (base_points >= 0),
  multiplier numeric(4, 2) not null default 1.00 check (multiplier > 0),
  final_points integer not null,
  idempotency_key text not null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  constraint wallet_transactions_unique_idempotency_key unique (idempotency_key),
  constraint wallet_transactions_final_points_check check (final_points = round(base_points * multiplier))
);

create index if not exists wallet_transactions_user_id_idx on public.wallet_transactions (user_id);
create index if not exists wallet_transactions_user_id_created_at_idx on public.wallet_transactions (user_id, created_at desc);

comment on table public.wallet_transactions is
  'Append-only Cognitive Stamina ledger. Balance is derived via SUM(final_points), never stored (docs/DATABASE.md §7). No application code writes here yet — reserved for the future Stamina service.';

-- =========================================================================
-- 6. updated_at bump on inquiries when a node is created (docs/DATABASE.md §3.2)
-- =========================================================================
create or replace function public.bump_inquiry_updated_at()
returns trigger
language plpgsql
as $$
begin
  update public.inquiries set updated_at = now() where id = new.inquiry_id;
  return new;
end;
$$;

drop trigger if exists question_nodes_bump_inquiry_updated_at on public.question_nodes;
create trigger question_nodes_bump_inquiry_updated_at
  after insert on public.question_nodes
  for each row
  execute function public.bump_inquiry_updated_at();

-- =========================================================================
-- 7. Row Level Security (docs/DATABASE.md §10)
-- =========================================================================
alter table public.learning_sources enable row level security;
alter table public.inquiries enable row level security;
alter table public.question_nodes enable row level security;
alter table public.follow_up_questions enable row level security;
alter table public.wallet_transactions enable row level security;

-- learning_sources: readable by any authenticated (including anonymous) role.
-- No insert/update/delete policy — curated content is seeded via privileged
-- tooling only.
drop policy if exists learning_sources_select_authenticated on public.learning_sources;
create policy learning_sources_select_authenticated
  on public.learning_sources
  for select
  to authenticated
  using (true);

-- inquiries: owner-only select/insert. No update/delete policy — nodes and
-- inquiries are immutable once created in the MVP.
drop policy if exists inquiries_select_own on public.inquiries;
create policy inquiries_select_own
  on public.inquiries
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists inquiries_insert_own on public.inquiries;
create policy inquiries_insert_own
  on public.inquiries
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- question_nodes: ownership via join back to the owning inquiry's user_id,
-- since this table carries no user_id directly (docs/DATABASE.md §10).
drop policy if exists question_nodes_select_own on public.question_nodes;
create policy question_nodes_select_own
  on public.question_nodes
  for select
  to authenticated
  using (
    exists (
      select 1 from public.inquiries
      where inquiries.id = question_nodes.inquiry_id
        and inquiries.user_id = auth.uid()
    )
  );

drop policy if exists question_nodes_insert_own on public.question_nodes;
create policy question_nodes_insert_own
  on public.question_nodes
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.inquiries
      where inquiries.id = question_nodes.inquiry_id
        and inquiries.user_id = auth.uid()
    )
  );

-- follow_up_questions: ownership via join through question_nodes -> inquiries.
drop policy if exists follow_up_questions_select_own on public.follow_up_questions;
create policy follow_up_questions_select_own
  on public.follow_up_questions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.question_nodes
      join public.inquiries on inquiries.id = question_nodes.inquiry_id
      where question_nodes.id = follow_up_questions.question_node_id
        and inquiries.user_id = auth.uid()
    )
  );

drop policy if exists follow_up_questions_insert_own on public.follow_up_questions;
create policy follow_up_questions_insert_own
  on public.follow_up_questions
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.question_nodes
      join public.inquiries on inquiries.id = question_nodes.inquiry_id
      where question_nodes.id = follow_up_questions.question_node_id
        and inquiries.user_id = auth.uid()
    )
  );

-- wallet_transactions: owner-only select. Deliberately NO insert/update/delete
-- policy for the authenticated role at all — every ledger write happens
-- through the backend's privileged service-role connection, inside a
-- trusted service method (docs/DATABASE.md §10, ARCHITECTURE.md §6.3).
drop policy if exists wallet_transactions_select_own on public.wallet_transactions;
create policy wallet_transactions_select_own
  on public.wallet_transactions
  for select
  to authenticated
  using (user_id = auth.uid());

-- =========================================================================
-- 8. Append-only ledger enforcement at the grant level (docs/DATABASE.md §11)
-- =========================================================================
-- service_role bypasses RLS by default; without this, it could still
-- UPDATE/DELETE wallet_transactions despite the "insert-only" product
-- requirement. Revoking those privileges makes immutability a Postgres
-- guarantee, not just application discipline.
revoke update, delete on public.wallet_transactions from authenticated, anon, service_role;
grant select, insert on public.wallet_transactions to service_role;
