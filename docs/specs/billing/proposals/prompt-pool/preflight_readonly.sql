-- READ-ONLY preflight for the prompt-pool proposals (C, B, A). ONE statement, ONE result set:
-- the Supabase SQL editor shows only the result of the last statement, so everything is combined
-- below and nothing here is wrapped in a transaction that rolls back. It contains only SELECTs and
-- cannot change data. Send back the whole result grid. It prints NO emails; section 8 prints user ids
-- (pseudonymous identifiers: share them only with people who may see account ids).
-- The md5 values pin the EXACT function bodies of this package (SHA256SUMS): if a hash says false the
-- installed object is a different version than the one that was reviewed.
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
    ('0 identity', 'database (on Supabase this is always "postgres": confirm the PROJECT REF in the dashboard URL yourself)', current_database()),
    ('0 identity', 'at', now()::text),
    ('1 objects', 'project_prompts table (if a required table or column is missing the WHOLE query errors: that is the signal, there is no false row)', (to_regclass('public.project_prompts') is not null)::text),
    ('1 objects', 'projects table', (to_regclass('public.projects') is not null)::text),
    ('1 objects', 'profiles table', (to_regclass('public.profiles') is not null)::text),
    ('1 objects', 'fn add_project_prompts (0039)', (to_regprocedure('public.add_project_prompts(uuid,uuid,integer,jsonb)') is not null)::text),
    ('1 objects', 'overrides table already present (B1 applied?)', (to_regclass('public.account_prompt_cap_overrides') is not null)::text),
    ('1 objects', 'profiles columns present (expect 5)', (select count(*)::text from information_schema.columns
        where table_schema='public' and table_name='profiles'
          and column_name in ('current_plan','trial_ends_at','stripe_subscription_id','email','cancel_at'))),
    ('2 profiles trigger', 'function body is byte-identical to the repo version from 0019 (expect true; false = a different version is installed: STOP and compare before applying C)',
        coalesce((select (md5(p.prosrc) = '8e47b8ec20a12a9ccec42a86501ea79f')::text from pg_proc p where p.proname='protect_billing_columns' and p.pronamespace='public'::regnamespace), 'missing')),
    ('2 profiles trigger', 'function body is already the C version (true = C was applied)',
        coalesce((select (md5(p.prosrc) = '3a8bf45188e43ff6dbcccc72dc933d07')::text from pg_proc p where p.proname='protect_billing_columns' and p.pronamespace='public'::regnamespace), 'missing')),
    ('2 profiles trigger', 'trigger fires on INSERT already',
        coalesce((select ((tgtype & 4) <> 0)::text from pg_trigger where tgrelid=to_regclass('public.profiles') and tgname='trg_profiles_protect_billing_columns'), 'missing')),
    ('3 protection today', 'policies on project_prompts', (select coalesce(string_agg(polname, ',' order by polname), 'none') from pg_policy where polrelid=to_regclass('public.project_prompts'))),
    ('3 protection today', 'non-internal triggers on project_prompts', (select coalesce(string_agg(tgname, ',' order by tgname), 'none') from pg_trigger where tgrelid=to_regclass('public.project_prompts') and not tgisinternal)),
    ('4 name clashes (expect none)', 'functions already named like ours', (select coalesce(string_agg(proname, ','), 'none') from pg_proc where pronamespace='public'::regnamespace
        and proname in ('account_prompt_cap','enforce_prompt_pool','prevent_prompt_reactivation','reactivate_project_prompts'))),
    ('5 size and locks', 'prompts total', (select count(*)::text from public.project_prompts)),
    ('5 size and locks', 'prompts active', (select count(*)::text from public.project_prompts where is_active)),
    ('5 size and locks', 'table size', pg_size_pretty(pg_total_relation_size('public.project_prompts'))),
    ('5 size and locks', 'open transactions older than 30 s (other sessions)', (select count(*)::text from pg_stat_activity
        where datname=current_database() and xact_start is not null and pid <> pg_backend_pid() and now() - xact_start > interval '30 seconds')),
    ('6 users without a profile row (C hole 1; expect 0)', 'count', (select count(*)::text from auth.users u left join public.profiles p on p.id = u.id where p.id is null)),
    ('7b identity for C (aggregates only, no emails)', 'EXPECT STEADY FALSE POSITIVES: nothing syncs a legitimate email change from auth.users into profiles, so a non-zero value is not by itself proof of tampering. Profiles whose email differs from auth.users email (case/space-insensitive)',
        (select count(*)::text from public.profiles pr join auth.users u on u.id = pr.id
          where lower(btrim(coalesce(pr.email,''))) is distinct from lower(btrim(coalesce(u.email,''))))),
    ('7b identity for C (aggregates only, no emails)', 'profiles with an empty email', (select count(*)::text from public.profiles where coalesce(btrim(email),'') = '')),
    ('7b identity for C (aggregates only, no emails)', 'auth users with no email', (select count(*)::text from auth.users where coalesce(btrim(email),'') = '')),
    ('7c possible PAST use of hole 1 (aggregates; C only blocks the future)', 'profiles created more than 1 minute after their auth user (a self-inserted profile is not created by the signup trigger)',
        (select count(*)::text from public.profiles pr join auth.users u on u.id = pr.id where pr.created_at > u.created_at + interval '1 minute')),
    ('7c possible PAST use of hole 1 (aggregates; C only blocks the future)', 'non-free plan, no subscription, and no 7-day trial window (read apart: legacy permanent-Pro accounts from the 0010 default also count)',
        (select count(*)::text from public.profiles pr where pr.current_plan <> 'free' and pr.stripe_subscription_id is null
            and (pr.trial_ends_at is null or pr.trial_ends_at > pr.created_at + interval '7 days 1 hour'))),
    ('7c possible PAST use of hole 1 (aggregates; C only blocks the future)', 'both of the above at once (strongest signal)',
        (select count(*)::text from public.profiles pr join auth.users u on u.id = pr.id
          where pr.created_at > u.created_at + interval '1 minute' and pr.current_plan <> 'free' and pr.stripe_subscription_id is null
            and (pr.trial_ends_at is null or pr.trial_ends_at > pr.created_at + interval '7 days 1 hour'))),
    ('7c possible PAST use of hole 1 (aggregates; C only blocks the future)', 'subscription id that does not look like a Stripe one, or a subscription without a customer id',
        (select count(*)::text from public.profiles pr where (pr.stripe_subscription_id is not null and pr.stripe_subscription_id not like 'sub\_%')
            or (pr.stripe_subscription_id is not null and pr.stripe_customer_id is null))),
    ('7c reading rule', '7c rows are a PRESENCE-ONLY signal: a profile can have been forged and later edited, and before C the owner could rewrite created_at. A 0 here is NOT evidence that nothing happened', 'n/a'),
    ('7d helpers to compare with the postflight', 'fingerprint of auth.role()/auth.uid() (body+config+owner)', coalesce((select string_agg(p.proname || ':' || md5(p.prosrc || coalesce(p.proconfig::text,'') || p.prosecdef::text || p.proowner::text), ' ' order by p.proname, p.oid) from pg_proc p where p.pronamespace='auth'::regnamespace and p.proname in ('role','uid')),'?')),
    ('7d helpers to compare with the postflight', 'handle_new_user (signup) is the repo version (expect true)', coalesce((select (md5(prosrc)='0ccd1cb3c754f92af7b764e1cd685f68')::text from pg_proc where proname='handle_new_user' and pronamespace='public'::regnamespace),'missing')),
    ('7d helpers to compare with the postflight', 'set_updated_at is the repo version (expect true)', coalesce((select (md5(prosrc)='9b1889f56258bf9d6554213c05019c76')::text from pg_proc where oid = to_regprocedure('public.set_updated_at()')),'missing')),
    ('7d helpers to compare with the postflight', 'role/database settings that change behaviour (expect 0)', (select count(*)::text from pg_db_role_setting s, unnest(s.setconfig) c where c ~* '^(session_replication_role|request\.jwt|search_path|row_security)')),
    ('7d helpers to compare with the postflight', 'is_project_owner body is the reviewed one (expect true)', coalesce((select (md5(prosrc)='b096af36e83c9b9f57568630bc5e84ef')::text from pg_proc where proname='is_project_owner' and pronamespace='public'::regnamespace),'missing')),
    ('7d helpers to compare with the postflight', 'row-level security on profiles and project_prompts (expect true)', coalesce((select bool_and(relrowsecurity)::text from pg_class where oid in (to_regclass('public.profiles'), to_regclass('public.project_prompts'))),'missing')),
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
