-- 0042_search_console_rec_states.sql
--
-- Phase: SEARCH-SEO-1 Fase 3e, state for the «Con tus datos de Google»
-- recommendations (founder decision 2026-10-11: «guardamos en base de datos,
-- hago migración», docs/brand/design-decisions-log.md §294).
--
-- Purpose: the Google recommendations are still computed live from Search
-- Console on every load (§293). This table only remembers what the customer
-- did with one of them: «Marcar como hecho» (`done`) or «Ahora no»
-- (`dismissed`). A remembered card is skipped and the next candidate of the
-- same kind takes its place. One row per (project, kind, query).
--
-- The query text and the position, impressions and CTR at the moment the
-- customer acted are copied here on purpose: they are what a later phase
-- needs to tell whether the change worked (same idea as the «Resueltas» tab,
-- ADR 0041). Nothing else from Search Console is stored.
--
-- Readable by the owner (RLS select policy). Written only by trusted server
-- code with the service-role client after ownership was verified in code,
-- always filtering by project_id AND owner_user_id: same pattern as
-- recommendations (0002) and generated_solutions (0005).
--
-- Until this migration is applied the cards show without those two buttons;
-- nothing else reads this table.
-- Apply manually in the Supabase SQL editor, after 0041.

create table if not exists public.search_console_rec_states (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  query text not null,
  status text not null,
  position_at numeric,
  impressions_at integer,
  ctr_at numeric,
  created_at timestamptz not null default now(),
  constraint search_console_rec_states_kind_chk check (kind in ('push_page_one', 'improve_snippet', 'watch_in_ai')),
  constraint search_console_rec_states_status_chk check (status in ('done', 'dismissed')),
  constraint search_console_rec_states_query_chk check (char_length(query) between 1 and 500),
  constraint search_console_rec_states_uniq unique (project_id, kind, query)
);

create index if not exists search_console_rec_states_owner_idx
  on public.search_console_rec_states (owner_user_id);

alter table public.search_console_rec_states enable row level security;

create policy search_console_rec_states_select_owner
on public.search_console_rec_states
for select
to authenticated
using (owner_user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policy for `authenticated`: writes go through the
-- server actions with the service role, which re-verify ownership first.
