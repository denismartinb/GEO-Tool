-- READ-ONLY postflight. ONE statement, ONE result set (see preflight note). Every row that belongs to
-- what you applied must say ok = true; rows of options you did NOT apply are expected false.
with f as (
  select
    exists (select 1 from pg_trigger where tgrelid='public.project_prompts'::regclass and tgname='trg_project_prompts_pool' and tgenabled='O'
            and tgfoid = to_regproc('public.enforce_prompt_pool') and (tgtype & 1) <> 0 and (tgtype & 2) <> 0 and (tgtype & 4) <> 0 and (tgtype & 16) <> 0) as b_trigger_ok,
    coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.account_prompt_cap_overrides')), false)
      and not exists (select 1 from pg_policy where polrelid = to_regclass('public.account_prompt_cap_overrides')) as b_overrides_rls_ok,
    case when to_regclass('public.account_prompt_cap_overrides') is null then false else
      not has_table_privilege('authenticated','public.account_prompt_cap_overrides','select')
      and not has_table_privilege('anon','public.account_prompt_cap_overrides','select')
      and not has_table_privilege('authenticated','public.account_prompt_cap_overrides','insert') end as b_overrides_closed,
    case when to_regprocedure('public.account_prompt_cap(uuid)') is null or to_regprocedure('public.enforce_prompt_pool()') is null then false else
      not has_function_privilege('authenticated','public.account_prompt_cap(uuid)','execute')
      and not has_function_privilege('authenticated','public.enforce_prompt_pool()','execute')
      and not has_function_privilege('anon','public.account_prompt_cap(uuid)','execute') end as b_functions_closed,
    (select count(*) = 2 and bool_and(prosecdef and proconfig @> array['search_path=""'])
       from pg_proc where proname in ('account_prompt_cap','enforce_prompt_pool') and pronamespace='public'::regnamespace) as b_definer_ok,
    not exists (select 1 from pg_policy where polrelid='public.project_prompts'::regclass and polname='prompts_insert_owner') as a2_insert_policy_gone,
    exists (select 1 from pg_trigger where tgrelid='public.project_prompts'::regclass and tgname='trg_project_prompts_no_reactivation' and tgenabled='O') as a2_trigger_ok,
    case when to_regprocedure('public.reactivate_project_prompts(uuid,uuid[],integer)') is null then false else
      has_function_privilege('service_role','public.reactivate_project_prompts(uuid,uuid[],integer)','execute')
      and not has_function_privilege('authenticated','public.reactivate_project_prompts(uuid,uuid[],integer)','execute')
      and not has_function_privilege('anon','public.reactivate_project_prompts(uuid,uuid[],integer)','execute') end as a1_fn_closed,
    exists (select 1 from pg_trigger where tgrelid='public.profiles'::regclass and tgname='trg_profiles_protect_billing_columns' and tgenabled='O' and (tgtype & 4) <> 0 and (tgtype & 16) <> 0) as c_trigger_fires_on_insert_and_update,
    (select pg_get_functiondef(oid) like '%email can only be changed%' from pg_proc where proname='protect_billing_columns' and pronamespace='public'::regnamespace) as c_email_guard_present,
    exists (select 1 from pg_policy where polrelid='public.project_prompts'::regclass and polname='prompts_update_owner')
      and exists (select 1 from pg_policy where polrelid='public.project_prompts'::regclass and polname='prompts_select_owner') as untouched_policies_present
)
select 'B: trigger present, enabled, row-level, before insert+update' as check_name, b_trigger_ok as ok from f
union all select 'B: overrides table has RLS and no policies', b_overrides_rls_ok from f
union all select 'B: anon/authenticated cannot touch overrides', b_overrides_closed from f
union all select 'B: anon/authenticated cannot execute the functions', b_functions_closed from f
union all select 'B: both functions SECURITY DEFINER with empty search_path (count = 2)', b_definer_ok from f
union all select 'A2: insert policy gone', a2_insert_policy_gone from f
union all select 'A2: reactivation trigger enabled', a2_trigger_ok from f
union all select 'A1: reactivate fn is service_role only', a1_fn_closed from f
union all select 'C: profiles trigger fires on insert and update', c_trigger_fires_on_insert_and_update from f
union all select 'C: email guard present in the function', coalesce(c_email_guard_present, false) from f
union all select 'untouched: select/update policies on project_prompts', untouched_policies_present from f
union all select 'row count prompts_total=' || count(*) || ' active=' || count(*) filter (where is_active) || ' (must equal preflight)', true from public.project_prompts;
