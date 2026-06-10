-- 0007_recommendations_superseded_status.sql
--
-- Phase: RECS-LIFECYCLE-1 (founder-approved 2026-06-10)
--
-- Purpose: allow recommendations to be marked 'superseded' when a newer
-- scan run completes for the same project. Required by the supersede
-- write in lib/scan/scan-runner.ts (PR #45): without this, the update
-- fails rec_status_chk (23514) on every scan completion and prior-run
-- recommendations stay 'active' forever, inflating the sidebar badge.
--
-- 'dismissed' is kept for its original meaning (user dismissed the
-- recommendation); 'superseded' means replaced by a newer run's output.
--
-- Apply manually in the Supabase SQL editor, in order, after 0006.

alter table public.recommendations
  drop constraint rec_status_chk,
  add constraint rec_status_chk
    check (status in ('active', 'dismissed', 'superseded'));
