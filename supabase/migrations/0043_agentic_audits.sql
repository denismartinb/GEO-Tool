-- 0043_agentic_audits.sql
--
-- Phase: AGENTIC-COMMERCE-1 Fase 2a, the «Auditoría agéntica» screen in the
-- console (founder approval 2026-10-17: «Merge y sigue con fase 2», on the
-- plan that named this migration; docs/brand/design-decisions-log.md §322,
-- docs/adr/0043-agentic-visibility-score.md).
--
-- Purpose: one row per «Revisar ahora». The customer gives the URL of one
-- product page of their own store; the same engine as the free checker
-- (lib/agentic-audit/, no LLM) reviews it and the result is kept so the
-- screen opens with the last review instead of running it again.
--
-- The row is written BEFORE the requests go out (status `pending`) and
-- closed afterwards, like `public_checks`: a review that dies halfway still
-- counts against the daily limit, which is the safe direction for requests
-- we send to someone else's site. The latest URL is the project's saved
-- product page; there is no column for it on `projects`.
--
-- `result` is the engine's `AgenticCheckResult`. Its `facts` are third-party
-- text, already cleaned and trimmed by lib/agentic-audit/page-facts.ts, and
-- are only ever rendered as text.
--
-- Readable by the owner (RLS select policy). Written only by trusted server
-- code with the service-role client after ownership was verified in code,
-- always filtering by project_id AND owner_user_id: same pattern as 0042.
--
-- Until this migration is applied the screen says the audit is not
-- available yet; nothing else reads this table.
-- Apply manually in the Supabase SQL editor, after 0042.

create table if not exists public.agentic_audits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  status text not null default 'pending',
  error_category text,
  score smallint,
  result jsonb,
  created_at timestamptz not null default now(),
  constraint agentic_audits_url_chk check (char_length(url) between 1 and 2048),
  constraint agentic_audits_status_chk check (status in ('pending', 'completed', 'failed')),
  constraint agentic_audits_score_chk check (score is null or (score between 0 and 100))
);

create index if not exists agentic_audits_project_created_idx
  on public.agentic_audits (project_id, created_at desc);

create index if not exists agentic_audits_owner_idx
  on public.agentic_audits (owner_user_id);

alter table public.agentic_audits enable row level security;

create policy agentic_audits_select_owner
on public.agentic_audits
for select
to authenticated
using (owner_user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policy for `authenticated`: writes go through the
-- server action with the service role, which re-verifies ownership first.
