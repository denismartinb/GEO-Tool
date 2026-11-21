-- 0048_email_events.sql
--
-- Phase: MAIL-METRICS-1 (founder-approved 2026-11-01,
-- docs/brand/design-decisions-log.md §419)
--
-- Purpose: keep what Resend tells us about each email (delivered, opened,
-- clicked, bounced, complained...) for longer than Resend's own 30 days, and
-- per email type. Rows arrive from the Resend webhook
-- (app/api/webhooks/resend), already signature-verified; the operator panel
-- reads them. Nothing else.
--
-- Deliberately minimal (data-minimisation, and the founder's ask): the
-- Resend email id, the event, the email type (the `kind` tag every send
-- carries, lib/email/kinds.ts) and two timestamps. Never the recipient, the
-- subject, the clicked URL, the IP or the user agent: the webhook drops them
-- before the insert.
--
-- `kind` has no CHECK on purpose: a new email type is a code change
-- (lib/email/kinds.ts), and a CHECK here would turn every new type into a
-- migration or, worse, into lost events. The webhook stores an unknown tag
-- value as null.
--
-- `webhook_id` is the `svix-id` header, the same for every retry of one
-- delivery, so a retried webhook is inserted once.
--
-- Written and read only by trusted server code with the service-role client.
-- RLS on, no policy, and the default grants revoked: nothing in the product
-- lets a customer read or write this table.
--
-- Apply manually in the Supabase SQL editor, after 0047, and BEFORE creating
-- the webhook in Resend: until it exists the webhook answers 503 and Resend
-- retries, so events wait instead of being lost (for a while).

create table if not exists public.email_events (
  id bigint generated always as identity primary key,
  webhook_id text not null,
  resend_email_id text not null,
  event text not null,
  kind text,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint email_events_event_chk check (event in (
    'sent',
    'delivered',
    'delivery_delayed',
    'opened',
    'clicked',
    'bounced',
    'complained',
    'failed',
    'suppressed'
  ))
);

create unique index if not exists email_events_webhook_id_uniq
  on public.email_events (webhook_id);

create index if not exists email_events_occurred_idx
  on public.email_events (occurred_at desc);

create index if not exists email_events_email_idx
  on public.email_events (resend_email_id);

alter table public.email_events enable row level security;

revoke all on public.email_events from anon, authenticated;
