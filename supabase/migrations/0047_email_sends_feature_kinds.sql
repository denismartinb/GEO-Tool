-- 0047_email_sends_feature_kinds.sql
--
-- Phase: FEATURE-EMAILS-1 (founder-approved texts and rules 2026-11-01,
-- docs/brand/design-decisions-log.md §417)
--
-- Purpose: let `email_sends` record the three feature emails, so each goes
-- out at most once per account:
--   feature_gsc        — connect Search Console
--   feature_extension  — the Chrome extension
--   feature_agentic    — the agentic audit (result, or the Starter upgrade)
--
-- Only widens the allowed values of `kind`, exactly like 0038. No new table,
-- column, policy or grant; RLS and the unique (owner_user_id, kind) index
-- stay as 0037 left them.
--
-- Apply manually in the Supabase SQL editor, after 0038, and BEFORE setting
-- FEATURE_EMAILS_ENABLED=true: until it is applied the claim insert fails,
-- and a failed claim sends nothing (lib/email/lifecycle/runner.ts,
-- `sendClaimedOnce`), so nothing goes out twice, but nothing goes out.

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
    'winback_d10',
    'feature_gsc',
    'feature_extension',
    'feature_agentic'
  ));
