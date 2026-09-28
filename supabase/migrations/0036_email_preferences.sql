-- 0036_email_preferences.sql
--
-- Phase: EMAIL-UNSUB-1 (Fase B of the lifecycle-email plan, founder-approved
-- 2026-09-28, docs/brand/design-decisions-log.md §232)
--
-- Purpose: one-click unsubscribe from every non-essential email, from the
-- email itself (no login) and from Ajustes → Notificaciones.
--
-- 1. Two more owner-editable preference columns, same shape as
--    `notify_score_drop_alert`/`notify_weekly_digest` (0020): plain flags on
--    the caller's own row, covered by the existing `profiles_update_own` RLS
--    policy, NOT added to protect_billing_columns().
--    - `notify_first_scan`: the "primer escaneo listo" email (Fase C).
--    - `notify_lifecycle`: tips, product news and offers (Fases C/D). Default
--      true because the legal basis is the existing customer relationship
--      (art. 21.2 LSSI) + legitimate interest, not consent — founder
--      decision 2026-09-28, no checkbox at signup.
--
-- 2. `email_preference_events`: an append-only record of every opt-out and
--    opt-back-in, with where it came from. It is the only evidence that an
--    unsubscribe was honoured, so it is written by the server alongside the
--    flag change, never instead of it.
--
-- Writes from a signed email link have no session: they go through the
-- service-role client after verifying an HMAC token bound to (user, category)
-- (lib/email/unsubscribe.ts). Writes from Ajustes use the user's own session,
-- hence the insert policy below.
--
-- Apply manually in the Supabase SQL editor, after 0035.

alter table public.profiles
  add column if not exists notify_first_scan boolean not null default true,
  add column if not exists notify_lifecycle boolean not null default true;

create table if not exists public.email_preference_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  enabled boolean not null,
  source text not null,
  created_at timestamptz not null default now(),
  constraint email_pref_category_chk check (category in (
    'score_drop',
    'weekly_digest',
    'first_scan',
    'lifecycle'
  )),
  constraint email_pref_source_chk check (source in (
    'settings',
    'email_link',
    'one_click'
  ))
);

create index if not exists email_preference_events_owner_created_idx
  on public.email_preference_events (owner_user_id, created_at desc);

alter table public.email_preference_events enable row level security;

create policy email_preference_events_select_owner
on public.email_preference_events
for select
to authenticated
using (owner_user_id = auth.uid());

create policy email_preference_events_insert_owner
on public.email_preference_events
for insert
to authenticated
with check (owner_user_id = auth.uid());

-- No UPDATE/DELETE policy: the record is append-only for everyone but the
-- service role, and the service role never updates it either.
