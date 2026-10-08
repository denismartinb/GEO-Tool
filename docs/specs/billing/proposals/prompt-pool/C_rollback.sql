-- Restores 0019's behaviour exactly (UPDATE-only trigger, no email guard). No data is changed.
-- ORDER: roll back B COMPLETELY first (B_rollback_1_disable.sql, THEN B_rollback_2_drop.sql) and A before that.
-- C_rollback reopens hole 1 (an account with no profile row self-inserts 'agency') and hole 2 (profiles.email);
-- while B's trigger exists — even DISABLED, because it could be re-enabled over a rolled-back C — or A's closure
-- objects exist, the guard below refuses.
begin;
set local lock_timeout = '3s';
do $$
begin
  -- Detected by NAME and by the FUNCTION it runs (a renamed trigger still enforces B).
  if exists (select 1 from pg_trigger where tgname = 'trg_project_prompts_pool'
             or tgfoid = to_regproc('public.enforce_prompt_pool')) then
    raise exception 'Option B''s trigger still exists: run B_rollback_1_disable.sql and B_rollback_2_drop.sql before C_rollback.sql';
  end if;
  if exists (select 1 from pg_trigger where tgname = 'trg_project_prompts_no_reactivation'
             or tgfoid = to_regproc('public.prevent_prompt_reactivation'))
     or to_regprocedure('public.reactivate_project_prompts(uuid,uuid[],integer)') is not null then
    raise exception 'Option A is applied: run A_rollback.sql before C_rollback.sql (A without C is not safe)';
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
