-- 0021_notifications.sql
--
-- Phase: NOTIF-SERVER-1a (ASYNC-SCAN-1 fase 1b, founder-approved 2026-07-25)
-- Spec: docs/specs/notifications/notifications-v1.md
--
-- Purpose: real, server-written in-app notifications, replacing the two
-- types derived on every dashboard render (lib/project-workspace.ts) with a
-- dedicated table written at the moment each event happens. Read state is
-- per-notification (read_at), not a single localStorage timestamp.
--
-- owner_user_id is denormalized from projects.owner_user_id so the read path
-- is a single indexed lookup with no join and no per-row is_project_owner()
-- evaluation. Safe today because project ownership never changes (no teams/
-- RBAC) — revisit this denormalization if that ever lands.
--
-- Apply manually in the Supabase SQL editor, after 0020.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid null references public.projects(id) on delete cascade,
  type text not null,
  severity text not null default 'info',
  payload_json jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  read_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint notif_type_chk check (type in (
    'scan_completed',
    'scan_failed',
    'gap_resolved',
    'gap_pending',
    'emerging_competitor',
    'ai_bot_blocked',
    'audit_completed',
    'trial_ending'
  )),
  constraint notif_severity_chk check (severity in ('success','info','warning','critical')),
  constraint notif_dedupe_len_chk check (char_length(dedupe_key) between 1 and 200)
);

create index notifications_owner_created_idx
  on public.notifications (owner_user_id, created_at desc);

create index notifications_owner_unread_idx
  on public.notifications (owner_user_id, created_at desc)
  where read_at is null;

create unique index notifications_owner_dedupe_uniq
  on public.notifications (owner_user_id, dedupe_key);

alter table public.notifications enable row level security;

create policy notifications_select_owner
on public.notifications
for select
to authenticated
using (owner_user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policy for `authenticated`: every write (emission
-- and mark-as-read) goes through trusted server code using the service-role
-- client, which re-verifies ownership explicitly in its WHERE clause — same
-- pattern as generated_solutions (0005) and web_audit_snapshots (0018).
