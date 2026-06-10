-- 0008_recurring_scans.sql
--
-- Phase: SCAN-RECURRING-1 (founder-approved 2026-06-10)
--
-- Purpose: prerequisite schema change for automated recurring (cron-triggered)
-- scans. Cron runs have no authenticated user, so scan_runs.triggered_by_user_id
-- (previously NOT NULL) must become nullable, with a new trigger_source column
-- distinguishing user-triggered vs cron-triggered runs. Also adds an opt-in
-- per-project flag for recurring scans (default off).
--
-- No RLS policy changes: scan_runs RLS is keyed off is_project_owner(project_id),
-- not triggered_by_user_id.
--
-- Apply manually in the Supabase SQL editor, in order, after 0007.

alter table public.scan_runs
  alter column triggered_by_user_id drop not null;

alter table public.scan_runs
  add column trigger_source text not null default 'user'
    check (trigger_source in ('user', 'cron'));

alter table public.scan_runs
  add constraint scan_runs_trigger_source_user_chk
    check (
      (trigger_source = 'user' and triggered_by_user_id is not null)
      or (trigger_source = 'cron' and triggered_by_user_id is null)
    );

alter table public.projects
  add column recurring_scans_enabled boolean not null default false;
