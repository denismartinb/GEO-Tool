-- READ-ONLY postflight. ONE statement, ONE result set (see preflight note). Every row that belongs to
-- what you applied must say ok = true; rows of options you did NOT apply are expected false.
with f as (
  select
    exists (select 1 from pg_trigger where tgrelid='public.project_prompts'::regclass and tgname='trg_project_prompts_pool' and tgenabled='O'
            and tgfoid = to_regproc('public.enforce_prompt_pool') and (tgtype & 3) = 3 and (tgtype & 4) <> 0 and (tgtype & 16) <> 0
              and tgattr::text = (select attnum::text from pg_attribute where attrelid='public.project_prompts'::regclass and attname='is_active')) as b_trigger_ok,
    coalesce((select bool_and(case proname when 'account_prompt_cap' then md5(prosrc)='497d365cdaaa971c4b3bf5f9d97d6eee' when 'enforce_prompt_pool' then md5(prosrc)='97322ba45fb4ba240a77c94a98fd0e5c' end)
       from pg_proc where proname in ('account_prompt_cap','enforce_prompt_pool') and pronamespace='public'::regnamespace), false)
      and (select count(*) from pg_proc where proname in ('account_prompt_cap','enforce_prompt_pool') and pronamespace='public'::regnamespace) = 2 as b_bodies_ok,
    coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.account_prompt_cap_overrides')), false)
      and not exists (select 1 from pg_policy where polrelid = to_regclass('public.account_prompt_cap_overrides')) as b_overrides_rls_ok,
    case when to_regclass('public.account_prompt_cap_overrides') is null then false else
      not has_table_privilege('authenticated','public.account_prompt_cap_overrides','select')
      and not has_table_privilege('anon','public.account_prompt_cap_overrides','select')
      and not has_table_privilege('authenticated','public.account_prompt_cap_overrides','insert')
      and not has_table_privilege('authenticated','public.account_prompt_cap_overrides','update')
      and not has_table_privilege('authenticated','public.account_prompt_cap_overrides','delete') end as b_overrides_closed,
    case when to_regprocedure('public.account_prompt_cap(uuid)') is null or to_regprocedure('public.enforce_prompt_pool()') is null then false else
      not has_function_privilege('authenticated','public.account_prompt_cap(uuid)','execute')
      and not has_function_privilege('authenticated','public.enforce_prompt_pool()','execute')
      and not has_function_privilege('anon','public.account_prompt_cap(uuid)','execute') end as b_functions_closed,
    (select count(*) = 2 and bool_and(prosecdef and proconfig @> array['search_path=""'])
       from pg_proc where proname in ('account_prompt_cap','enforce_prompt_pool') and pronamespace='public'::regnamespace) as b_definer_ok,
    not exists (select 1 from pg_policy where polrelid='public.project_prompts'::regclass and polname='prompts_insert_owner') as a2_insert_policy_gone,
    exists (select 1 from pg_trigger where tgrelid='public.project_prompts'::regclass and tgname='trg_project_prompts_no_reactivation' and tgenabled='O'
            and tgfoid = to_regproc('public.prevent_prompt_reactivation') and (tgtype & 3) = 3 and (tgtype & 16) <> 0)
      and coalesce((select md5(prosrc)='d36bc9b8a7b362fcddae63c76c29161c' from pg_proc where proname='prevent_prompt_reactivation' and pronamespace='public'::regnamespace), false) as a2_trigger_ok,
    case when to_regprocedure('public.reactivate_project_prompts(uuid,uuid[],integer)') is null then false else
      (select md5(prosrc)='01ede988de512059ae9c4c482326715f' from pg_proc where proname='reactivate_project_prompts' and pronamespace='public'::regnamespace)
      and has_function_privilege('service_role','public.reactivate_project_prompts(uuid,uuid[],integer)','execute')
      and not has_function_privilege('authenticated','public.reactivate_project_prompts(uuid,uuid[],integer)','execute')
      and not has_function_privilege('anon','public.reactivate_project_prompts(uuid,uuid[],integer)','execute') end as a1_fn_closed,
    exists (select 1 from pg_trigger where tgrelid='public.profiles'::regclass and tgname='trg_profiles_protect_billing_columns' and tgenabled='O'
            and tgfoid = to_regproc('public.protect_billing_columns') and (tgtype & 3) = 3 and (tgtype & 4) <> 0 and (tgtype & 16) <> 0) as c_trigger_fires_on_insert_and_update,
    coalesce((select md5(prosrc)='51223ea4a5bed224b0af362ff1a4fa6c' from pg_proc where proname='protect_billing_columns' and pronamespace='public'::regnamespace), false) as c_body_is_reviewed_version,
    exists (select 1 from pg_policy where polrelid='public.project_prompts'::regclass and polname='prompts_update_owner')
      and exists (select 1 from pg_policy where polrelid='public.project_prompts'::regclass and polname='prompts_select_owner') as untouched_policies_present
)
select 'B: trigger present, enabled, row-level, before insert+update' as check_name, b_trigger_ok as ok from f
union all select 'B: overrides table has RLS and no policies', b_overrides_rls_ok from f
union all select 'B: anon/authenticated cannot touch overrides', b_overrides_closed from f
union all select 'B: anon/authenticated cannot execute the functions', b_functions_closed from f
union all select 'B: function bodies are the reviewed versions (count = 2)', b_bodies_ok from f
union all select 'B: both functions SECURITY DEFINER with empty search_path (count = 2)', b_definer_ok from f
union all select 'A2: insert policy gone', a2_insert_policy_gone from f
union all select 'A2: reactivation trigger enabled', a2_trigger_ok from f
union all select 'A1: reactivate fn is service_role only', a1_fn_closed from f
union all select 'C: profiles trigger fires on insert and update', c_trigger_fires_on_insert_and_update from f
union all select 'C: function body is byte-identical to the reviewed C version', c_body_is_reviewed_version from f
union all select 'untouched: select/update policies on project_prompts', untouched_policies_present from f
union all select 'row count prompts_total=' || count(*) || ' active=' || count(*) filter (where is_active) || ' (informational: compare with the preflight; legitimate traffic may change it)', true from public.project_prompts;
