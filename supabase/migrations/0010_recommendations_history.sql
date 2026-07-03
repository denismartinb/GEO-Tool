-- 0010_recommendations_history.sql
--
-- Phase: RECS-3 (founder-approved 2026-07-03) — recommendations "memory"
-- across scan runs: recent wins, open-streak tracking, and (separately, no
-- schema needed) a user-facing dismiss action.
--
-- Reviewed by data-guardian before implementation. Key decisions from that
-- review:
--
-- - dedupe_key is the internal per-candidate identity key the recommendation
--   engine already computes in memory (lib/recommendations/
--   recommendation-engine.ts CandidateRec.dedupeKey) but never persisted.
--   Persisting it is what lets a new run recognize "this is the same gap as
--   last run" instead of only comparing rule_id/recommendation_type, which
--   is not specific enough for per-prompt cards (e.g. two different prompts
--   both produce recommendation_type='increase_brand_visibility').
-- - consecutive_runs_open is carried forward (not recomputed via a backward
--   scan) by application code each time a run reinserts a still-open
--   dedupe_key — see lib/scan/executor.ts.
-- - resolved_in_run_id (not reusing run_id) lets a "resolved" row keep its
--   original run_id (the run where the gap still existed) while recording
--   which later run first confirmed it gone — the Recommendations page reads
--   recent wins by resolved_in_run_id = latest completed run, not run_id.
-- - Composite FK (resolved_in_run_id, project_id) -> scan_runs(id,
--   project_id) mirrors the existing rec_run_project_fk pattern (relies on
--   scan_runs_id_project_uniq from 0001), so a resolved row can never point
--   at a run belonging to a different project.
-- - dedupe_key defaults to '' only to backfill existing rows without a
--   rewrite; the default is dropped immediately after so every future
--   insert must supply it explicitly (a missing dedupe_key on a new insert
--   should fail loudly, not silently write '').
-- - No RLS change: 'resolved' rows are written by the existing service-role
--   write path in lib/scan/executor.ts (already bypasses RLS) and read via
--   the existing owner-scoped SELECT policy (recommendations_select_owner,
--   0002) — no new policy needed. The dismiss action a founder-facing button
--   will later use also goes through a service-role server action with
--   explicit ownership re-verification in code, NOT a new UPDATE policy.
--
-- Apply manually in the Supabase SQL editor, in order, after 0009.

alter table public.recommendations
  add column dedupe_key text not null default '',
  add column consecutive_runs_open integer not null default 1,
  add column resolved_in_run_id uuid null;

alter table public.recommendations
  alter column dedupe_key drop default;

alter table public.recommendations
  add constraint rec_consecutive_runs_chk check (consecutive_runs_open >= 1);

alter table public.recommendations
  add constraint rec_resolved_run_project_fk
    foreign key (resolved_in_run_id, project_id)
    references public.scan_runs (id, project_id)
    on delete set null;

alter table public.recommendations
  drop constraint rec_status_chk,
  add constraint rec_status_chk
    check (status in ('active', 'dismissed', 'superseded', 'resolved'));

create index rec_project_dedupe_idx on public.recommendations (project_id, dedupe_key, status);
create index rec_resolved_in_run_idx on public.recommendations (resolved_in_run_id) where resolved_in_run_id is not null;
