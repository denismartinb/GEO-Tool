-- 0010_profile_current_plan.sql
--
-- Phase: BILLING-3-plan-persistence (founder-approved 2026-07-03)
--
-- Purpose: persist the user's chosen plan for real. Previously "current plan"
-- was a hardcoded "pro" string in components/billing/billing-content.tsx and
-- the change-plan modal only held it in client state (lost on reload). This
-- adds a single column to store it, defaulting to 'pro' so existing accounts
-- see no change until they explicitly pick a different plan.
--
-- Product decision (founder, 2026-07-03): plan changes are instantaneous in
-- both directions (upgrade and downgrade) — there is no real billing cycle
-- yet to justify deferring a downgrade, so no "scheduled change" column is
-- needed.
--
-- No RLS policy changes: profiles already has profiles_update_own
-- (id = auth.uid()) from 0002_v0_rls.sql, which covers this new column.
--
-- Apply manually in the Supabase SQL editor, in order, after 0009.

alter table public.profiles
  add column current_plan text not null default 'pro'
    check (current_plan in ('free', 'starter', 'pro', 'agency'));
