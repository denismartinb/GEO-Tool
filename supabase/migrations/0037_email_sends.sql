-- 0037_email_sends.sql
--
-- Phase: LIFECYCLE-TRIAL-1 (Fase C of the lifecycle-email plan,
-- founder-approved 2026-09-28, docs/brand/design-decisions-log.md §233)
--
-- Purpose: "each lifecycle email at most once per account". The sequence is
-- driven by a daily cron (/api/cron/lifecycle-emails) and by the first scan
-- completing; both can run more than once for the same account (a retried
-- cron, a second scan), so the send itself has to be remembered somewhere
-- durable. One row per (account, kind), written AFTER the email was accepted
-- by Resend — a failed send must stay eligible for the next pass.
--
-- Also the source of the "at most one lifecycle email every 48 h" rule: the
-- runner reads the latest `sent_at` among the lifecycle kinds.
--
-- Written and read only by trusted server code with the service-role client
-- (the cron and the scan finalizer have no user session). RLS on, and no
-- policy for `authenticated`: nothing in the product lets a customer read or
-- write this table.
--
-- Apply manually in the Supabase SQL editor, after 0036.

create table if not exists public.email_sends (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  constraint email_sends_kind_chk check (kind in (
    'first_scan',
    'trial_d1',
    'trial_d3',
    'trial_d5'
  ))
);

create unique index if not exists email_sends_owner_kind_uniq
  on public.email_sends (owner_user_id, kind);

create index if not exists email_sends_owner_sent_idx
  on public.email_sends (owner_user_id, sent_at desc);

alter table public.email_sends enable row level security;
