-- 0038_stripe_webhook_events.sql
--
-- Phase: SEC-WEBHOOK-REGISTRY-1 (PR de seguridad de facturación, founder-
-- approved 2026-10-08, docs/brand/design-decisions-log.md §236)
--
-- Purpose: Stripe delivers webhooks at-least-once and not in order. Until now
-- the handler relied on "every write is naturally idempotent", which is true
-- of the profile columns but NOT of the side effects: a retried event sent the
-- plan/cancellation/payment-failed email again, and an old
-- `customer.subscription.deleted` arriving late could wipe a newer
-- subscription. This table is the durable memory the handler was missing:
--
--   * one row per Stripe event id  -> a retry of a processed event is a no-op
--     (and sends no email);
--   * `subject_id` + `stripe_created` -> per-subscription ordering: an event
--     older than one already applied for the same subscription is stale, and
--     nothing is applied after that subscription's `deleted`.
--
-- Written and read only by trusted server code with the service-role client
-- (the Stripe webhook has no user session). RLS on, and no policy for
-- `authenticated`: nothing in the product lets a customer read or write it.
--
-- Until this migration is applied the route degrades to the previous
-- behaviour (it logs loudly and processes the event unregistered) rather than
-- rejecting every webhook, so applying it is safe at any time but should
-- happen BEFORE merging. Apply manually in the Supabase SQL editor, after 0037.

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  subject_id text,
  stripe_created timestamptz not null,
  status text not null default 'processing',
  outcome text,
  attempts integer not null default 1,
  claimed_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  constraint stripe_webhook_events_status_chk check (status in ('processing', 'processed', 'failed'))
);

create index if not exists stripe_webhook_events_subject_idx
  on public.stripe_webhook_events (subject_id, stripe_created desc)
  where subject_id is not null;

alter table public.stripe_webhook_events enable row level security;

-- Defense in depth: billing data, so also drop Supabase's default table grants
-- (RLS without policies already denies; this removes the grant itself).
revoke all on public.stripe_webhook_events from anon, authenticated;
