-- 0038_email_sends_winback_kinds.sql
--
-- Phase: LIFECYCLE-WINBACK-1 (Fase D of the lifecycle-email plan,
-- founder-approved design 2026-09-28, docs/brand/design-decisions-log.md §238)
--
-- Purpose: let `email_sends` record the four post-trial emails, so each goes
-- out at most once per account and D+3/D+10 can anchor on the end-of-trial
-- send:
--   trial_ended       — fin de prueba, sent the day the trial ends
--   trial_ended_late  — the same email, once, for a trial that ended >48 h
--                       ago and was never told
--   winback_d3        — D+3, last scan's competitor gap
--   winback_d10       — D+10, the launch price's deadline
--
-- Only widens the allowed values of `kind`. No new table, column, policy or
-- grant; RLS and the unique (owner_user_id, kind) index stay as 0037 left
-- them. The plan said "sin migración nueva" for this phase; it overlooked that
-- 0037 pinned `kind` with a check constraint.
--
-- Apply manually in the Supabase SQL editor, after 0037. Until it is applied,
-- a post-trial send is still delivered but its `email_sends` insert fails
-- (logged as "email sent but not recorded"), so the next daily pass would
-- send it again — apply it BEFORE turning LIFECYCLE_EMAILS_ENABLED on.

alter table public.email_sends drop constraint if exists email_sends_kind_chk;

alter table public.email_sends
  add constraint email_sends_kind_chk check (kind in (
    'first_scan',
    'trial_d1',
    'trial_d3',
    'trial_d5',
    'trial_ended',
    'trial_ended_late',
    'winback_d3',
    'winback_d10'
  ));
