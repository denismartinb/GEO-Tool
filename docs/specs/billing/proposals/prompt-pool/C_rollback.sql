-- Restores 0019's behaviour exactly (UPDATE-only trigger, no email guard). No data is changed.
-- ORDER: roll back B FIRST (B_rollback_1_disable.sql). C_rollback reopens hole 1, and under an active B an
-- account with no profile row could then self-insert 'agency' and obtain cap 300; the guard below refuses.
begin;
set local lock_timeout = '3s';
do $$
begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.project_prompts'::regclass
             and tgname = 'trg_project_prompts_pool' and tgenabled <> 'D') then
    raise exception 'Option B is active: run B_rollback_1_disable.sql before C_rollback.sql';
  end if;
end $$;
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
create or replace trigger trg_profiles_protect_billing_columns
before update on public.profiles
for each row execute function public.protect_billing_columns();
commit;
