-- 0049_geo_alerts.sql
--
-- Phase: GEO-ALERTS-1 (founder-approved 2026-11-02,
-- docs/brand/design-decisions-log.md §440)
--
-- Purpose:
--   1. `notifications.type` gains `ai_bot_unblocked`: «Resuelto: Perplexity
--      ya puede leer tu web» in the bell's «Algo ha cambiado» lane.
--   2. `profiles.notify_site_alerts`: the new optional email category «Avisos
--      de tu web» (an AI engine stops being able to enter the site). Default
--      true, one-click unsubscribe like the other optional categories, and
--      `email_preference_events` accepts it as a category.
--
-- No new table, policy or grant. `notify_site_alerts` is covered by the
-- owner's existing update policy on `profiles`, like 0036's columns.
--
-- Apply manually in the Supabase SQL editor, after 0048. Until it is applied:
--   - the resolved notice fails its insert and is logged (emit is fail-soft),
--   - the site alert email is never sent (the preference read fails closed),
--   - Ajustes shows the toggle as on and saving it fails.

alter table public.notifications
  drop constraint if exists notif_type_chk;

alter table public.notifications
  add constraint notif_type_chk check (type in (
    -- NOTIF-SERVER-1a (0021)
    'scan_completed',
    'scan_failed',
    'gap_resolved',
    'gap_pending',
    'emerging_competitor',
    'ai_bot_blocked',
    'audit_completed',
    'trial_ending',
    -- WEB-AUDIT-ALERTS-1 (0029)
    'coverage_dropped',
    'surfacing_dropped',
    'llms_txt_lost',
    'sitemap_lost',
    'page_unreachable',
    -- GEO-ALERTS-1 (0049)
    'ai_bot_unblocked'
  ));

alter table public.profiles
  add column if not exists notify_site_alerts boolean not null default true;

-- The preference history (0036) records the new category too.
alter table public.email_preference_events
  drop constraint if exists email_pref_category_chk;

alter table public.email_preference_events
  add constraint email_pref_category_chk check (category in (
    'score_drop',
    'weekly_digest',
    'first_scan',
    'lifecycle',
    'site_alerts'
  ));
