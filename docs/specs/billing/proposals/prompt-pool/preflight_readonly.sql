-- READ-ONLY preflight for the prompt-pool proposals. Paste into the Supabase SQL
-- editor of the target database. Changes nothing: the transaction is READ ONLY, so
-- any accidental write errors out instead of executing.
-- Send the full output back before anything from A_*.sql / B_*.sql is run.
begin read only;

-- 1. Which database is this? (compare with the one you intend to change)
select current_database() as db, current_user as role, now() as at, version();

-- 2. Objects the proposals depend on.
select 'table project_prompts'  as needed, to_regclass('public.project_prompts')  is not null as present
union all select 'table projects',          to_regclass('public.projects')          is not null
union all select 'table profiles',          to_regclass('public.profiles')          is not null
union all select 'fn is_project_owner',     to_regprocedure('public.is_project_owner(uuid)') is not null
union all select 'fn add_project_prompts (0039, Option A only)', to_regprocedure('public.add_project_prompts(uuid,uuid,integer,jsonb)') is not null
union all select 'table account_prompt_cap_overrides (B creates it; present = already applied)', to_regclass('public.account_prompt_cap_overrides') is not null;

select 'profiles.' || column_name as needed_column, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('current_plan', 'trial_ends_at', 'stripe_subscription_id', 'email');   -- expect 4 rows

-- 3. Current protection on project_prompts: expect policies prompts_select_owner /
--    prompts_insert_owner / prompts_update_owner and ONLY the updated_at trigger.
select polname, polcmd from pg_policy where polrelid = 'public.project_prompts'::regclass order by 1;
select tgname, tgenabled from pg_trigger where tgrelid = 'public.project_prompts'::regclass and not tgisinternal order by 1;

-- 4. Names the proposals will create must not already exist for another purpose.
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('account_prompt_cap', 'enforce_prompt_pool', 'prevent_prompt_reactivation', 'reactivate_project_prompts');

-- 5. Size / lock exposure. Both proposals take a brief ACCESS EXCLUSIVE-free lock
--    (CREATE TRIGGER takes SHARE ROW EXCLUSIVE on project_prompts: it blocks writes
--    for the duration of the statement, i.e. milliseconds, never reads).
select count(*) as prompts_total, count(*) filter (where is_active) as prompts_active from public.project_prompts;
select pg_size_pretty(pg_total_relation_size('public.project_prompts')) as table_size;
select pid, state, now() - xact_start as xact_age, left(query, 80) as query
from pg_stat_activity
where datname = current_database() and xact_start is not null and pid <> pg_backend_pid()
order by xact_start limit 10;       -- long transactions here would delay CREATE TRIGGER

-- 6. GRANDFATHER LIST (Option B): accounts that, under the derived cap, are ALREADY
--    over it. They keep their rows; they just cannot add or re-activate until back
--    under. Decide per account before enabling (override, or accept).
with usage as (
  select p.owner_user_id as uid, count(*) as active
  from public.project_prompts pp join public.projects p on p.id = pp.project_id
  where pp.is_active group by 1
), derived as (
  select pr.id as uid, pr.email, pr.current_plan, pr.trial_ends_at, pr.stripe_subscription_id,
         case
           when pr.trial_ends_at is not null and pr.stripe_subscription_id is null and pr.trial_ends_at <= now() then 'free'
           else pr.current_plan
         end as effective_plan
  from public.profiles pr
)
select d.email, d.current_plan, d.effective_plan, u.active,
       case d.effective_plan when 'free' then 10 when 'starter' then 25 when 'pro' then 75 when 'agency' then 300 else 10 end as derived_cap
from usage u join derived d on d.uid = u.uid
where u.active > case d.effective_plan when 'free' then 10 when 'starter' then 25 when 'pro' then 75 when 'agency' then 300 else 10 end
order by u.active desc;

-- 7. COMPED / override candidates: the app's COMPED_ACCOUNT_EMAILS env list is
--    invisible to SQL. For each comped email, check its row here; every one that
--    holds more than its stored plan allows needs an override row BEFORE enabling B.
select email, current_plan, stripe_subscription_id is not null as has_subscription
from public.profiles
order by email
limit 0;    -- intentionally empty: filter by YOUR comped emails (do not paste them in tickets)

-- 8. Orphans that would make the owner lookup fail silently (expect 0).
select count(*) as prompts_without_project
from public.project_prompts pp left join public.projects p on p.id = pp.project_id where p.id is null;

rollback;
