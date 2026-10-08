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
-- Also `stripe_subscription_locks`: a per-subscription lease, so two events
-- about the same subscription are never applied concurrently (the ordering
-- check reads history and then writes; without the lease two parallel
-- invocations could both pass it).
--
-- FAILS CLOSED until this migration is applied: the webhook answers 503
-- instead of processing events without idempotency/ordering. Stripe retries a
-- non-2xx for ~3 days in LIVE mode but only a few times over a few hours in
-- TEST mode, so events can be LOST if the code is deployed first. Apply it
-- BEFORE deploying the code that needs it, and check the tables exist.
-- Apply manually in the Supabase SQL editor, after 0037.

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

create table if not exists public.stripe_subscription_locks (
  subject_id text primary key,
  event_id text not null,
  locked_at timestamptz not null default now()
);

alter table public.stripe_subscription_locks enable row level security;

-- Defense in depth: billing data, so also drop Supabase's default table grants
-- (RLS without policies already denies; this removes the grant itself).
revoke all on public.stripe_webhook_events from anon, authenticated;
revoke all on public.stripe_subscription_locks from anon, authenticated;
