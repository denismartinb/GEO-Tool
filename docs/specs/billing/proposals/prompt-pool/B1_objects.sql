-- PROPOSAL — NOT A MIGRATION. Option B, STEP 1 of 2: objects only. NOTHING IS ENFORCED after this
-- file. Tested ONLY against a local Postgres. Owner-run. Order and rollback: RUNBOOK.md.
--
-- Option B: the pool is enforced by a ROW TRIGGER on project_prompts with the cap DERIVED IN THE
-- DATABASE from the owner's plan. No service_role in the user flow, no caller-supplied cap.
--
-- Depends on: 0001, 0002, 0010, 0015, 0017 (profiles plan/trial/subscription columns).
-- Must be preceded by C_profiles_guards.sql (otherwise an account without a profile row can insert
-- its own with plan 'agency' and obtain cap 300).
--
-- Cap derivation (mirrors lib/billing.ts resolveSystemPlanId, read-only):
--   1. row in account_prompt_cap_overrides                -> that cap (comped / "a medida")
--   2. missing profile                                    -> 10 (fail closed)
--   3. trial elapsed and no stripe_subscription_id        -> free (10)
--   4. current_plan: free 10 · starter 25 · pro 75 · agency 300
--   5. unknown plan value                                 -> 10 (fail closed)
-- The numbers are pinned to app/pricing/plans-data.ts by lib/projects/prompt-pool-sql.test.ts.
--
-- ONE SOURCE FOR "COMPED": the app reads COMPED_ACCOUNT_EMAILS (env, by email) and this table is by
-- user_id; they WILL drift if both are edited by hand. Until one replaces the other, every email in
-- COMPED_ACCOUNT_EMAILS needs a row here (RUNBOOK.md, "overrides"), and the same goes for any
-- "Agency a medida" account with a cap above 300.
--
-- No foreign key to auth.users on purpose: adding one takes SHARE ROW EXCLUSIVE on auth.users, which
-- blocks logins and signups while it waits. An override for a deleted user is inert.

begin;
set local lock_timeout = '3s';

create table if not exists public.account_prompt_cap_overrides (
  user_id uuid primary key,
  cap integer not null check (cap between 0 and 10000),
  note text null,
  created_at timestamptz not null default now()
);

-- RLS on with NO policies: invisible and unwritable to anon/authenticated.
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

  -- Under REPEATABLE READ / SERIALIZABLE the count below uses the transaction's OLD snapshot and can
  -- miss rows committed while we waited for the lock (reproduced: 74 -> 76). PostgREST is always
  -- READ COMMITTED; only a direct database client can get here, and it is refused.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'prompt_pool requires READ COMMITTED' using errcode = '0A000';
  end if;

  select owner_user_id into v_owner from public.projects where id = new.project_id;
  if v_owner is null then
    return new; -- the foreign key reports the real problem
  end if;

  -- One lock per ACCOUNT, held to the end of the transaction. The count below is a fresh statement
  -- after the lock, so it sees every row a previous holder committed and, inside one multi-row
  -- statement, the rows that statement already inserted.
  -- Known and accepted: a multi-statement transaction that already holds a row lock and then waits
  -- here can deadlock with one doing the reverse (Postgres aborts one with 40P01). Availability, not
  -- a way past the cap.
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
