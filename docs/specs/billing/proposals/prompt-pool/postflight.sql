-- READ-ONLY postflight. ONE statement, ONE result set (the Supabase SQL editor shows only the last result).
-- Every row that belongs to what you applied must say ok = true; rows of options you did NOT apply are
-- expected false. It pins, per object, the md5 of the function BODY (`prosrc`), SECURITY DEFINER and
-- search_path, and per trigger its timing, events, columns, WHEN clause and function, so a look-alike or
-- weakened install reads false. It does NOT see object ownership. CRLF pasted into the editor changes the
-- md5 and reads false: that fails safe (re-paste with LF).
with
is_active_attnum as (select attnum::text as a from pg_attribute where attrelid='public.project_prompts'::regclass and attname='is_active'),
f as (
  select
    exists (select 1 from pg_trigger t, is_active_attnum x where t.tgrelid='public.project_prompts'::regclass and t.tgname='trg_project_prompts_pool'
            and t.tgenabled='O' and t.tgqual is null and t.tgfoid = to_regproc('public.enforce_prompt_pool')
            and (t.tgtype & 3) = 3 and (t.tgtype & 4) <> 0 and (t.tgtype & 16) <> 0 and (t.tgtype & 40) = 0
            and t.tgattr::text = x.a) as b_trigger_ok,
    coalesce((select bool_and(prosecdef and proconfig = array['search_path=""']
                 and md5(prosrc) = case proname when 'account_prompt_cap' then '497d365cdaaa971c4b3bf5f9d97d6eee' when 'enforce_prompt_pool' then '97322ba45fb4ba240a77c94a98fd0e5c' end)
       from pg_proc where proname in ('account_prompt_cap','enforce_prompt_pool') and pronamespace='public'::regnamespace), false)
      and (select count(*) from pg_proc where proname in ('account_prompt_cap','enforce_prompt_pool') and pronamespace='public'::regnamespace) = 2 as b_functions_ok,
    coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.account_prompt_cap_overrides')), false)
      and not exists (select 1 from pg_policy where polrelid = to_regclass('public.account_prompt_cap_overrides'))
      and (select count(*) from information_schema.columns where table_schema='public' and table_name='account_prompt_cap_overrides'
             and ((column_name='user_id' and data_type='uuid' and is_nullable='NO') or (column_name='cap' and data_type='integer' and is_nullable='NO')
               or (column_name='note' and data_type='text') or (column_name='created_at' and data_type='timestamp with time zone'))) = 4
      and exists (select 1 from pg_constraint where conrelid = to_regclass('public.account_prompt_cap_overrides') and contype='c'
                  and pg_get_constraintdef(oid) like '%cap >= 0%cap <= 10000%')
      and exists (select 1 from pg_constraint where conrelid = to_regclass('public.account_prompt_cap_overrides') and contype='p') as b_overrides_shape_ok,
    case when to_regclass('public.account_prompt_cap_overrides') is null then false else
      not has_table_privilege('authenticated','public.account_prompt_cap_overrides','select')
      and not has_table_privilege('anon','public.account_prompt_cap_overrides','select')
      and not has_table_privilege('authenticated','public.account_prompt_cap_overrides','insert')
      and not has_table_privilege('authenticated','public.account_prompt_cap_overrides','update')
      and not has_table_privilege('authenticated','public.account_prompt_cap_overrides','delete') end as b_overrides_closed,
    case when to_regprocedure('public.account_prompt_cap(uuid)') is null or to_regprocedure('public.enforce_prompt_pool()') is null then false else
      not has_function_privilege('authenticated','public.account_prompt_cap(uuid)','execute')
      and not has_function_privilege('authenticated','public.enforce_prompt_pool()','execute')
      and not has_function_privilege('anon','public.account_prompt_cap(uuid)','execute')
      and not has_function_privilege('anon','public.enforce_prompt_pool()','execute') end as b_functions_closed,
    not exists (select 1 from pg_policy where polrelid='public.project_prompts'::regclass and polname='prompts_insert_owner') as a2_insert_policy_gone,
    exists (select 1 from pg_trigger t, is_active_attnum x where t.tgrelid='public.project_prompts'::regclass and t.tgname='trg_project_prompts_no_reactivation'
            and t.tgenabled='O' and t.tgqual is null and t.tgfoid = to_regproc('public.prevent_prompt_reactivation')
            and (t.tgtype & 3) = 3 and (t.tgtype & 16) <> 0 and (t.tgtype & 44) = 0 and t.tgattr::text = x.a)
      and coalesce((select md5(prosrc)='d36bc9b8a7b362fcddae63c76c29161c' and not prosecdef and proconfig = array['search_path=""']
                    from pg_proc where proname='prevent_prompt_reactivation' and pronamespace='public'::regnamespace), false) as a2_trigger_ok,
    case when to_regprocedure('public.reactivate_project_prompts(uuid,uuid[],integer)') is null then false else
      coalesce((select md5(prosrc)='01ede988de512059ae9c4c482326715f' and prosecdef and proconfig = array['search_path=""']
                from pg_proc where proname='reactivate_project_prompts' and pronamespace='public'::regnamespace), false)
      and has_function_privilege('service_role','public.reactivate_project_prompts(uuid,uuid[],integer)','execute')
      and not has_function_privilege('authenticated','public.reactivate_project_prompts(uuid,uuid[],integer)','execute')
      and not has_function_privilege('anon','public.reactivate_project_prompts(uuid,uuid[],integer)','execute') end as a1_fn_ok,
    exists (select 1 from pg_trigger t where t.tgrelid='public.profiles'::regclass and t.tgname='trg_profiles_protect_billing_columns'
            and t.tgenabled='O' and t.tgqual is null and t.tgattr::text = '' and t.tgfoid = to_regproc('public.protect_billing_columns')
            and (t.tgtype & 3) = 3 and (t.tgtype & 4) <> 0 and (t.tgtype & 16) <> 0 and (t.tgtype & 40) = 0) as c_trigger_ok,
    coalesce((select md5(prosrc)='51223ea4a5bed224b0af362ff1a4fa6c' and prosecdef and proconfig = array['search_path=""']
              from pg_proc where proname='protect_billing_columns' and pronamespace='public'::regnamespace), false) as c_function_ok,
    coalesce((select count(*) = 2
                and bool_and(polname = 'prompts_select_owner' and pg_get_expr(polqual, polrelid) = 'is_project_owner(project_id)' and polcmd = 'r' and polwithcheck is null
                          or polname = 'prompts_update_owner' and pg_get_expr(polqual, polrelid) = 'is_project_owner(project_id)'
                             and pg_get_expr(polwithcheck, polrelid) = 'is_project_owner(project_id)' and polcmd = 'w')
              from pg_policy where polrelid='public.project_prompts'::regclass and polname in ('prompts_select_owner','prompts_update_owner')), false) as untouched_policies_ok
)
select 'B: trigger present, enabled, BEFORE ROW insert+update of is_active only, no WHEN' as check_name, b_trigger_ok as ok from f
union all select 'B: both functions are the reviewed bodies, SECURITY DEFINER, search_path pinned', b_functions_ok from f
union all select 'B: overrides table has the reviewed shape, RLS on, no policies', b_overrides_shape_ok from f
union all select 'B: anon/authenticated cannot touch overrides', b_overrides_closed from f
union all select 'B: anon/authenticated cannot execute the functions', b_functions_closed from f
union all select 'A2: insert policy gone', a2_insert_policy_gone from f
union all select 'A2: reactivation trigger and function are the reviewed ones', a2_trigger_ok from f
union all select 'A1: reactivate fn is the reviewed body and service_role only', a1_fn_ok from f
union all select 'C: profiles trigger BEFORE ROW insert+update, all columns, no WHEN', c_trigger_ok from f
union all select 'C: function is the reviewed body, SECURITY DEFINER, search_path pinned', c_function_ok from f
union all select 'untouched: select/update policies on project_prompts have their original expressions', untouched_policies_ok from f
union all select 'row count prompts_total=' || count(*) || ' active=' || count(*) filter (where is_active) || ' (informational: compare with the preflight; legitimate traffic may change it)', true from public.project_prompts;
