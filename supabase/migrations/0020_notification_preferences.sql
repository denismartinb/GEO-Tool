-- 0020_notification_preferences.sql
--
-- Phase: ALERTS-1 Fase 6a (founder-approved 2026-07-11, see docs/launch-plan.md)
--
-- Purpose: /dashboard/settings/notifications is a client-only shell today —
-- its toggles don't read or write anything. This adds real, owner-editable
-- preference columns for the two notifications this phase implements
-- (score-drop alert, weekly digest placeholder for Fase 6b). The other
-- toggles on that page (competitor movement, new recommendations, scan
-- completed, product news) stay client-only/fake for now — out of scope for
-- this PR.
--
-- Unlike current_plan/stripe_*/trial_ends_at/cancel_at (0016/0017/0019),
-- these are plain user preferences: the owner is meant to change them
-- directly via their own session, so they are NOT added to
-- protect_billing_columns() — the existing profiles_update_own RLS policy
-- (row-level, owner_user_id = auth.uid()) already covers this correctly.
--
-- Apply manually in the Supabase SQL editor, after 0019.

alter table public.profiles
  add column notify_score_drop_alert boolean not null default true,
  add column notify_weekly_digest boolean not null default true;
