-- Restores 0019's behaviour exactly (UPDATE-only trigger, no email guard). No data is changed.
begin;
set local lock_timeout = '3s';
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
drop trigger if exists trg_profiles_protect_billing_columns on public.profiles;
create trigger trg_profiles_protect_billing_columns
before update on public.profiles
for each row execute function public.protect_billing_columns();
commit;
