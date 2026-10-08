-- READ-ONLY postflight. Run after applying a proposal; each row must show ok = true
-- for the option you applied (the other option's rows are expected false).
begin read only;

select 'B: trigger present and enabled' as check_name,
       exists (select 1 from pg_trigger where tgrelid = 'public.project_prompts'::regclass and tgname = 'trg_project_prompts_pool' and tgenabled = 'O') as ok
union all select 'B: overrides table has RLS and no policies',
       coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.account_prompt_cap_overrides')), false)
       and not exists (select 1 from pg_policy where polrelid = to_regclass('public.account_prompt_cap_overrides'))
union all select 'B: authenticated cannot read overrides',  case when to_regclass('public.account_prompt_cap_overrides') is null then false else not has_table_privilege('authenticated', 'public.account_prompt_cap_overrides', 'select') end
union all select 'B: anon cannot read overrides',           case when to_regclass('public.account_prompt_cap_overrides') is null then false else not has_table_privilege('anon', 'public.account_prompt_cap_overrides', 'select') end
union all select 'B: authenticated cannot execute account_prompt_cap', case when to_regprocedure('public.account_prompt_cap(uuid)') is null then false else not has_function_privilege('authenticated', 'public.account_prompt_cap(uuid)', 'execute') end
union all select 'B: authenticated cannot execute enforce_prompt_pool', case when to_regprocedure('public.enforce_prompt_pool()') is null then false else not has_function_privilege('authenticated', 'public.enforce_prompt_pool()', 'execute') end
union all select 'B: functions are SECURITY DEFINER with empty search_path',
       coalesce((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc where proname in ('account_prompt_cap','enforce_prompt_pool') and pronamespace = 'public'::regnamespace), false)
union all select 'A2: insert policy gone',      not exists (select 1 from pg_policy where polrelid = 'public.project_prompts'::regclass and polname = 'prompts_insert_owner')
union all select 'A2: reactivation trigger enabled', exists (select 1 from pg_trigger where tgrelid = 'public.project_prompts'::regclass and tgname = 'trg_project_prompts_no_reactivation' and tgenabled = 'O')
union all select 'A1: reactivate fn service_role only',
       case when to_regprocedure('public.reactivate_project_prompts(uuid,uuid[],integer)') is null then false else
         has_function_privilege('service_role', 'public.reactivate_project_prompts(uuid,uuid[],integer)', 'execute')
         and not has_function_privilege('authenticated', 'public.reactivate_project_prompts(uuid,uuid[],integer)', 'execute')
         and not has_function_privilege('anon', 'public.reactivate_project_prompts(uuid,uuid[],integer)', 'execute') end
union all select 'untouched: prompts_update_owner still present', exists (select 1 from pg_policy where polrelid = 'public.project_prompts'::regclass and polname = 'prompts_update_owner')
union all select 'untouched: prompts_select_owner still present', exists (select 1 from pg_policy where polrelid = 'public.project_prompts'::regclass and polname = 'prompts_select_owner');

-- Row counts must equal the preflight's (installing changes no rows).
select count(*) as prompts_total, count(*) filter (where is_active) as prompts_active from public.project_prompts;

rollback;
