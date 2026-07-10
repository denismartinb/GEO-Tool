-- 0017_reverse_trial.sql
--
-- Phase: BILLING-STRIPE-1 PR 3 — reverse trial (founder-approved 2026-07-10,
-- 7 days, replacing the CTA-based free-forever plan grant from
-- 0011_signup_plan_from_metadata.sql now that real Stripe billing exists).
--
-- Purpose: every new signup now starts on a real Pro trial for 7 days,
-- regardless of which /pricing CTA they clicked — showing the full product
-- (all AI engines, higher caps, trend data) instead of a capped Free
-- experience. When the trial ends without a real Stripe subscription, the
-- account downgrades to Free automatically (lib/billing.ts, checked lazily
-- on the next plan read) — existing data is never deleted, just capped
-- again by the Free plan's own limits.
--
-- trial_ends_at is protected by the same trigger as current_plan/stripe ids
-- (0016_protect_billing_columns.sql): only the service role may write it,
-- so a user can't extend their own trial via a direct API call.

alter table public.profiles
  add column trial_ends_at timestamptz;

create or replace function public.protect_billing_columns()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.current_plan is distinct from old.current_plan
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     or new.trial_ends_at is distinct from old.trial_ends_at then
    raise exception 'current_plan, stripe_customer_id, stripe_subscription_id and trial_ends_at can only be changed by the service role';
  end if;

  return new;
end;
$$;

-- Replaces 0011_signup_plan_from_metadata.sql's handle_new_user(): every new
-- account now starts on Pro with a 7-day trial, ignoring raw_user_meta_data's
-- plan hint entirely (that mechanism predates real billing and granted a
-- paid plan for free, permanently — no longer appropriate now that Stripe
-- Checkout exists). Anyone signing up without /pricing metadata gets the
-- same trial, not Free — the whole point of a reverse trial is showing
-- everyone the full product first.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, current_plan, trial_ends_at)
  values (new.id, coalesce(new.email, ''), 'pro', now() + interval '7 days')
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  return new;
end;
$$;
