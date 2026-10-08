-- PROPOSAL — NOT A MIGRATION (lives outside supabase/migrations/ on purpose).
-- Option B of the prompt-pool decision: the pool is enforced by a ROW TRIGGER on
-- project_prompts, with the cap DERIVED IN THE DATABASE from the owner's plan.
-- No service_role in the user flow, no application-passed cap, nothing a REST
-- caller can route around: every insert and every inactive->active transition
-- goes through the same check, whoever issues it.
-- Tested ONLY against a local Postgres (scripts/verify-prompt-pool-proposals.sh).
-- Never applied to any shared/production database by the agent. Owner-run.
--
-- Depends on: 0001, 0002, 0010 (profiles.current_plan), 0017 (trial_ends_at),
-- 0015 (stripe_subscription_id). Does NOT require 0039 and coexists with it.
--
-- Cap derivation (mirrors lib/billing.ts resolveSystemPlanId, READ-ONLY):
--   1. override row in account_prompt_cap_overrides   -> that cap (comped accounts)
--   2. missing profile                                  -> 10 (fail closed)
--   3. trial elapsed and no stripe_subscription_id      -> free (10)
--   4. current_plan: free 10 · starter 25 · pro 75 · agency 300
--   5. unknown plan value                               -> 10 (fail closed)
-- The numbers are pinned to app/pricing/plans-data.ts caps by a Vitest drift test
-- (lib/projects/prompt-pool-sql.test.ts): changing a plan cap without this file
-- fails CI.
--
-- GRANDFATHERING: the trigger only gates growth. Existing rows are never touched;
-- an account above its derived cap can still edit and deactivate, but cannot add
-- or re-activate until it is back under the cap.
--
-- COMPED ACCOUNTS: COMPED_ACCOUNT_EMAILS lives in an env var SQL cannot see. Before
-- this trigger is enabled, every comped account needs a row in the overrides table
-- or it is capped at its stored plan (RUNBOOK.md, step "overrides").

-- TWO STEPS, run as two separate executions (RUNBOOK.md):
--   STEP 1 — objects only (table, cap function, trigger function). Nothing is enforced yet.
--   (between the steps: insert the override rows for comped accounts)
--   STEP 2 — activation: creates the trigger. This is the only line that changes behaviour,
--            and dropping that one trigger is the complete rollback.

-- ============================== STEP 1 ==============================
begin;
set local lock_timeout = '3s';

create table if not exists public.account_prompt_cap_overrides (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cap integer not null check (cap between 0 and 10000),
  note text null,
  created_at timestamptz not null default now()
);

-- RLS on with NO policies: invisible and unwritable to anon/authenticated; the
-- operator (postgres / SQL editor) and service_role manage it.
alter table public.account_prompt_cap_overrides enable row level security;
revoke all on public.account_prompt_cap_overrides from anon, authenticated;

create or replace function public.account_prompt_cap(p_owner uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_override integer;
  v_plan text;
  v_trial timestamptz;
  v_sub text;
  v_found boolean;
begin
  select cap into v_override from public.account_prompt_cap_overrides where user_id = p_owner;
  if v_override is not null then
    return v_override;
  end if;

  select current_plan, trial_ends_at, stripe_subscription_id, true
    into v_plan, v_trial, v_sub, v_found
  from public.profiles where id = p_owner;

  if v_found is not true then
    return 10;
  end if;

  if v_trial is not null and v_sub is null and v_trial <= now() then
    v_plan := 'free';
  end if;

  return case v_plan
    when 'free' then 10
    when 'starter' then 25
    when 'pro' then 75
    when 'agency' then 300
    else 10
  end;
end;
$$;

revoke all on function public.account_prompt_cap(uuid) from public, anon, authenticated;

create or replace function public.enforce_prompt_pool()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_active integer;
  v_cap integer;
begin
  if tg_op = 'INSERT' then
    if not new.is_active then return new; end if;
  else
    -- Only the inactive -> active transition grows the pool.
    if not (new.is_active and not old.is_active) then return new; end if;
  end if;

  select owner_user_id into v_owner from public.projects where id = new.project_id;
  if v_owner is null then
    return new; -- the foreign key reports the real problem
  end if;

  -- One lock per ACCOUNT, held to the end of the transaction. The count below is a
  -- fresh statement after the lock, so it sees every row a previous holder committed
  -- and, inside one multi-row statement, the rows that statement already inserted.
  perform pg_advisory_xact_lock(hashtextextended('prompt_pool:' || v_owner::text, 0));

  select count(*) into v_active
  from public.project_prompts pp
  join public.projects p on p.id = pp.project_id
  where p.owner_user_id = v_owner and pp.is_active;

  v_cap := public.account_prompt_cap(v_owner);

  if v_active + 1 > v_cap then
    raise exception 'prompt_pool_full'
      using errcode = '23514',
            detail = format('active=%s cap=%s', v_active, v_cap);
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_prompt_pool() from public, anon, authenticated;

commit;

-- ============================== STEP 2 ==============================
begin;
set local lock_timeout = '3s';

drop trigger if exists trg_project_prompts_pool on public.project_prompts;
create trigger trg_project_prompts_pool
  before insert or update of is_active on public.project_prompts
  for each row execute function public.enforce_prompt_pool();

commit;

-- ============================== ROLLBACK ==============================
--   drop trigger if exists trg_project_prompts_pool on public.project_prompts;
--   drop function if exists public.enforce_prompt_pool();
--   drop function if exists public.account_prompt_cap(uuid);
--   drop table if exists public.account_prompt_cap_overrides;   -- loses the override rows: export first
-- No project_prompts row is changed by installing or removing this.
