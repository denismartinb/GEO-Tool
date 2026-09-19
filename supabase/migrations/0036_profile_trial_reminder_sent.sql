-- 0036_profile_trial_reminder_sent.sql
--
-- Phase: TRIAL-REMINDER-3D-1 (founder-approved 2026-09-19)
--
-- Purpose: idempotency mark for the "your Pro trial ends in 3 days" reminder
-- email (`sendTrialEndingSoonEmail`, `lib/email/transactional.ts`), sent by
-- the new `/api/cron/trial-reminders` cron. Without it, every daily pass
-- would re-send the reminder to the same account for as long as
-- `trial_ends_at` stays inside the 3-day window.
--
-- Same shape as `onboarding_tour_seen_at` (0035): a plain, service-role-only
-- timestamp on the caller's own row, never written by the user themselves —
-- only the cron (service role) sets it, so no RLS policy needs to cover it.
--
-- A timestamp rather than a boolean, same reasoning as 0035: costs nothing
-- extra and gives an operator a "when", not just a "whether", for free.
--
-- Apply manually in the Supabase SQL editor, after 0035.

alter table public.profiles
  add column if not exists trial_reminder_sent_at timestamptz;
