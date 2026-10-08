-- READ-ONLY preflight for the prompt-pool proposals (C, B, A). ONE statement, ONE result set:
-- the Supabase SQL editor shows only the result of the last statement, so everything is combined
-- below and nothing here is wrapped in a transaction that rolls back. It contains only SELECTs and
-- cannot change data. Send back the whole result grid. It prints NO emails (user ids only).
with
usage as (
  select p.owner_user_id as uid, count(*) as active
  from public.project_prompts pp join public.projects p on p.id = pp.project_id
  where pp.is_active group by 1
),
derived as (
  select pr.id as uid, pr.current_plan,
         case when pr.trial_ends_at is not null and pr.stripe_subscription_id is null and pr.trial_ends_at <= now()
              then 'free' else pr.current_plan end as effective_plan
  from public.profiles pr
),
over_cap as (
  select d.uid, d.current_plan, d.effective_plan, u.active,
         case d.effective_plan when 'free' then 10 when 'starter' then 25 when 'pro' then 75 when 'agency' then 300 else 10 end as cap
  from usage u join derived d on d.uid = u.uid
),
checks(section, item, value) as (
  values
    ('0 identity', 'database', current_database()),
    ('0 identity', 'at', now()::text),
    ('1 objects', 'project_prompts table', (to_regclass('public.project_prompts') is not null)::text),
    ('1 objects', 'projects table', (to_regclass('public.projects') is not null)::text),
    ('1 objects', 'profiles table', (to_regclass('public.profiles') is not null)::text),
    ('1 objects', 'fn add_project_prompts (0039)', (to_regprocedure('public.add_project_prompts(uuid,uuid,integer,jsonb)') is not null)::text),
    ('1 objects', 'overrides table already present (B1 applied?)', (to_regclass('public.account_prompt_cap_overrides') is not null)::text),
    ('1 objects', 'profiles columns present (expect 5)', (select count(*)::text from information_schema.columns
        where table_schema='public' and table_name='profiles'
          and column_name in ('current_plan','trial_ends_at','stripe_subscription_id','email','cancel_at'))),
    ('2 profiles trigger', 'definition mentions cancel_at (0019 version; expect true)',
        coalesce((select (pg_get_functiondef(p.oid) like '%cancel_at%')::text from pg_proc p where p.proname='protect_billing_columns' and p.pronamespace='public'::regnamespace), 'missing')),
    ('2 profiles trigger', 'trigger fires on INSERT already (C applied?)',
        coalesce((select ((tgtype & 4) <> 0)::text from pg_trigger where tgrelid='public.profiles'::regclass and tgname='trg_profiles_protect_billing_columns'), 'missing')),
    ('3 protection today', 'policies on project_prompts', (select coalesce(string_agg(polname, ',' order by polname), 'none') from pg_policy where polrelid='public.project_prompts'::regclass)),
    ('3 protection today', 'non-internal triggers on project_prompts', (select coalesce(string_agg(tgname, ',' order by tgname), 'none') from pg_trigger where tgrelid='public.project_prompts'::regclass and not tgisinternal)),
    ('4 name clashes (expect none)', 'functions already named like ours', (select coalesce(string_agg(proname, ','), 'none') from pg_proc where pronamespace='public'::regnamespace
        and proname in ('account_prompt_cap','enforce_prompt_pool','prevent_prompt_reactivation','reactivate_project_prompts'))),
    ('5 size and locks', 'prompts total', (select count(*)::text from public.project_prompts)),
    ('5 size and locks', 'prompts active', (select count(*)::text from public.project_prompts where is_active)),
    ('5 size and locks', 'table size', pg_size_pretty(pg_total_relation_size('public.project_prompts'))),
    ('5 size and locks', 'open transactions older than 30 s (other sessions)', (select count(*)::text from pg_stat_activity
        where datname=current_database() and xact_start is not null and pid <> pg_backend_pid() and now() - xact_start > interval '30 seconds')),
    ('6 users without a profile row (C hole 1; expect 0)', 'count', (select count(*)::text from auth.users u left join public.profiles p on p.id = u.id where p.id is null)),
    ('7 orphans (expect 0)', 'prompts without a project', (select count(*)::text from public.project_prompts pp left join public.projects p on p.id = pp.project_id where p.id is null)),
    ('8 grandfathered under B', 'accounts above their derived cap', (select count(*)::text from over_cap where active > cap))
)
select section, item, value from checks
union all
-- One row per grandfathered account (user id only; look the email up yourself, do not paste it).
select '8 grandfathered under B', 'uid ' || uid::text || ' plan=' || coalesce(effective_plan,'?'), 'active=' || active || ' cap=' || cap
from over_cap where active > cap
union all
-- Accounts whose stored plan is above free but whose effective plan is free (expired trial, no sub).
select '9 info', 'accounts on an expired trial still stored as pro', count(*)::text
from derived where current_plan = 'pro' and effective_plan = 'free'
order by 1, 2;
-- COMPED / "a medida": the app's COMPED_ACCOUNT_EMAILS is invisible to SQL. For each comped email,
-- look up its user id in the dashboard and add an override row BEFORE B2 (RUNBOOK.md, "overrides").
