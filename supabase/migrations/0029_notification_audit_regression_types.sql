-- 0029_notification_audit_regression_types.sql
--
-- Phase: WEB-AUDIT-ALERTS-1 — regression notices in the notification bell,
-- the half of WEB-AUDIT-3 (docs/specs/web-audit/phase-3-daily-audit.md) that
-- was left out because, before AUDIT-AFTER-SCAN-1 (ADR 0027), there was
-- nothing to compare: two manual audits weeks apart are two loose photos,
-- not a regression. The audit now refreshes itself after every scan, so the
-- comparison finally means something.
--
-- What this changes: `notif_type_chk` only. The design of WEB-AUDIT-3 claimed
-- this phase needed no schema at all, and that was written when the bell
-- derived its items on the fly from recent rows. NOTIF-SERVER-1a replaced
-- that with a real `notifications` table whose `type` column is guarded by a
-- CHECK, so a new kind of notice is now exactly one thing: an entry in that
-- list. No new table, no new column, no new index, no data migration.
--
-- `ai_bot_blocked` is deliberately NOT re-added: it is already in the allowed
-- set from 0021 and already has copy and a dedupe key. The "bot_blocked"
-- notice of the WEB-AUDIT-3 design is that same type, emitted from the audit
-- comparison rather than never emitted at all.
--
-- Idempotent and re-runnable from an unknown state (migrations.test.ts): the
-- constraint is dropped if present and re-added with the final allowed set,
-- so applying this twice — or applying it after a half-finished attempt —
-- converges on the same schema.
--
-- Apply manually in the Supabase SQL editor, after 0028.

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
    -- WEB-AUDIT-ALERTS-1: audit-to-audit regressions
    'coverage_dropped',
    'surfacing_dropped',
    'llms_txt_lost',
    'sitemap_lost',
    'page_unreachable'
  ));
