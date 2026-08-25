-- 0035_profile_onboarding_tour_seen.sql
--
-- Phase: ONBOARDING-TOUR-PERSIST-1 (founder-approved 2026-08-25)
--
-- Purpose: the "ya lo he visto" mark for the onboarding tour popup
-- (`components/tour-provider.tsx`) lived only in `localStorage`, by explicit
-- design (ONBOARDING-TOUR-1) to avoid a schema migration. The cost was
-- accepted and documented: the popup reappears on any new browser, private
-- window, or after clearing site storage — which is exactly the complaint
-- this migration fixes.
--
-- Same shape as `notify_score_drop_alert`/`notify_weekly_digest`
-- (0020_notification_preferences.sql): a plain, owner-editable flag on the
-- caller's own row. The existing `profiles_update_own` RLS policy
-- (owner_user_id = auth.uid()) already covers this correctly — no RLS
-- change, no service-role path.
--
-- A timestamp rather than a boolean: costs nothing extra and gives an
-- operator glancing at the table a "when", not just a "whether", for free.
--
-- Apply manually in the Supabase SQL editor, after 0034.

alter table public.profiles
  add column if not exists onboarding_tour_seen_at timestamptz;
