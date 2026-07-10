-- 0015_stripe_billing.sql
--
-- Phase: BILLING-STRIPE-1 (founder-approved 2026-07-10, Task Intake)
--
-- Purpose: track the Stripe identifiers needed to sync a real subscription
-- back to profiles.current_plan from the Stripe webhook
-- (app/api/webhooks/stripe/route.ts), and later (PR 2) to open a Stripe
-- Customer Portal session for a given user.
--
-- No RLS policy changes: profiles already has profiles_update_own
-- (id = auth.uid()) from 0002_v0_rls.sql. In practice these two columns are
-- only ever written by the webhook via the service-role client (never by an
-- authenticated user directly) — the existing policy is unaffected either
-- way since it only scopes by row ownership, not by column.
--
-- Apply manually in the Supabase SQL editor, in order, after 0014.

alter table public.profiles
  add column stripe_customer_id text unique,
  add column stripe_subscription_id text;
