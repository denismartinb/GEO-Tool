-- 0027_jobs_web_audit_type.sql
--
-- Phase: AUDIT-AFTER-SCAN-1 (founder-approved 2026-08-04)
--
-- Purpose: let the web audit run as a background job after every scan, with
-- retries, instead of only when a human clicks "Auditar ahora". The founder's
-- reason is that in production scans will be automatic and daily ("como
-- Semrush, al cliente se le abstrae de lanzar ningún escaneo"), so the user is
-- not present when the scan finishes and nobody would ever press the button.
--
-- The `jobs` table already carries everything a robust retry policy needs —
-- attempt_count, max_attempts, next_attempt_at (backoff), last_error, the
-- 'retrying'/'failed' states and the locked_by/locked_at claim columns. The
-- ONLY thing standing in the way is `jobs_type_chk`, which hard-codes the
-- three scan job types from 0001. So this migration widens exactly that
-- constraint and nothing else: no new table, no new column, no new index.
--
-- Apply manually in the Supabase SQL editor, after 0026.
--
-- Idempotent on purpose (see 0023's header): these are applied by hand, and a
-- dropped connection mid-apply leaves an unknown state that must be safe to
-- re-run. Dropping the constraint before adding it is what makes re-running
-- safe — `add constraint` alone would fail the second time.
--
-- Widening a CHECK is backwards-compatible: every row that satisfied the old
-- constraint satisfies the new one, so no backfill and no downtime. Rolling
-- back means re-adding the narrower constraint, which is only safe once no
-- 'web_audit' rows remain.

alter table public.jobs
  drop constraint if exists jobs_type_chk;

alter table public.jobs
  add constraint jobs_type_chk
  check (job_type in ('scan_start', 'scan_prompt', 'scan_finalize', 'web_audit'));

comment on constraint jobs_type_chk on public.jobs is
  'Allowed job types. web_audit added in 0027 (AUDIT-AFTER-SCAN-1): the post-scan web audit runs through this same queue so it inherits attempt_count/max_attempts/next_attempt_at retries rather than reimplementing them.';
