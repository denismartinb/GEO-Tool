-- 0019_subscription_cancel_at.sql
--
-- Phase: BILLING-STRIPE-1 follow-up (founder-approved 2026-07-11)
--
-- Purpose: found via live testing — canceling a subscription through the
-- Stripe Customer Portal schedules the cancellation for the end of the
-- current billing period (subscription.cancel_at_period_end), but the app
-- had nowhere to store that, so the billing page kept showing the plan as
-- plainly "active" with the normal change/cancel buttons instead of telling
-- the owner their plan is already scheduled to end, and when.
--
-- profiles.cancel_at mirrors Stripe's subscription.cancel_at (the real
-- end-of-period timestamp) whenever customer.subscription.updated reports
-- cancel_at_period_end=true, and is cleared back to null if the owner
-- reactivates (Stripe unsets cancel_at_period_end) or the subscription
-- actually ends (current_plan already flips to free in that case).
--
-- Protected by the same trigger as the other billing columns (0016/0017):
-- only the service role (the webhook) may write it.
--
-- Apply manually in the Supabase SQL editor, after 0018.

alter table public.profiles
  add column cancel_at timestamptz;

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
     or new.trial_ends_at is distinct from old.trial_ends_at
     or new.cancel_at is distinct from old.cancel_at then
    raise exception 'current_plan, stripe_customer_id, stripe_subscription_id, trial_ends_at and cancel_at can only be changed by the service role';
  end if;

  return new;
end;
$$;
