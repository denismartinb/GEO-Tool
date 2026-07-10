-- 0016_protect_billing_columns.sql
--
-- Phase: BILLING-STRIPE-1 follow-up (founder-approved 2026-07-10, ahead of
-- PR 3's reverse trial) — security hardening found while scoping PR 3.
--
-- Problem: profiles_update_own (0002_v0_rls.sql) only checks row ownership
-- (id = auth.uid()), not which columns are being changed. Any authenticated
-- user can call the Supabase REST/JS API directly with their own session —
-- no app code involved — and set their own current_plan, stripe_customer_id
-- or stripe_subscription_id to anything, self-granting a paid plan for free
-- and bypassing changePlan's archive/cancel checks and the webhook entirely.
-- This has existed since 0010 (current_plan) and 0015 (the Stripe columns);
-- PR 3 would otherwise extend the same hole to a self-writable trial_ends_at.
--
-- Fix: reject any change to these columns unless made by the service role.
-- changePlan (app/dashboard/settings/billing/actions.ts) is updated in the
-- same PR to perform its own final write via the service-role client, after
-- doing all its validation (archiving, domain-cap recheck, real Stripe
-- cancellation) under the user's own session as before — only the
-- privileged write itself moves, the business logic does not. The webhook
-- already writes via the service role and is unaffected.
--
-- Apply manually in the Supabase SQL editor, after 0015.

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
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id then
    raise exception 'current_plan, stripe_customer_id and stripe_subscription_id can only be changed by the service role';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_protect_billing_columns on public.profiles;
create trigger trg_profiles_protect_billing_columns
before update on public.profiles
for each row execute function public.protect_billing_columns();
