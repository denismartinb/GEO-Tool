-- READ-ONLY postflight. ONE statement, ONE result set (the Supabase SQL editor shows only the last result).
-- Every row that belongs to what you applied must say ok = true; rows of options you did NOT apply are
-- expected false. IT IS A TRIPWIRE, NOT A PROOF: it pins the objects of this package AND the surrounding surface
-- (the exact set of triggers and policies on project_prompts and profiles, row-level security, the ownership
-- helper, database-level settings that switch triggers off, the overrides table's shape and privileges), so a
-- look-alike, an extra trigger or an extra permissive policy reads false. It does NOT see object ownership, the
-- bodies of auth.role()/auth.uid() (they differ between Supabase and the local stub: they are printed as
-- md5 rows to compare with the PREFLIGHT output), or anything outside this list. CRLF pasted into the editor
-- changes the md5 and reads false: that fails safe (re-paste with LF).
with
is_active_attnum as (select attnum::text as a from pg_attribute where attrelid='public.project_prompts'::regclass and attname='is_active'),
user_id_attnum as (select attnum from pg_attribute where attrelid = to_regclass('public.account_prompt_cap_overrides') and attname='user_id' and not attisdropped),
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
      and (select count(*) from information_schema.columns where table_schema='public' and table_name='account_prompt_cap_overrides') = 4
      and (select count(*) from information_schema.columns where table_schema='public' and table_name='account_prompt_cap_overrides'
             and ((column_name='user_id' and data_type='uuid' and is_nullable='NO') or (column_name='cap' and data_type='integer' and is_nullable='NO')
               or (column_name='note' and data_type='text') or (column_name='created_at' and data_type='timestamp with time zone'))) = 4
      and (select count(*) from pg_constraint where conrelid = to_regclass('public.account_prompt_cap_overrides')) = 2
      and exists (select 1 from pg_constraint c, user_id_attnum u where c.conrelid = to_regclass('public.account_prompt_cap_overrides') and c.contype='p' and c.conkey = array[u.attnum]::int2[])
      and exists (select 1 from pg_constraint where conrelid = to_regclass('public.account_prompt_cap_overrides') and contype='c'
                  and pg_get_constraintdef(oid) = 'CHECK (((cap >= 0) AND (cap <= 10000)))' and convalidated) as b_overrides_shape_ok,
    case when to_regclass('public.account_prompt_cap_overrides') is null then false else
      not (has_table_privilege('authenticated','public.account_prompt_cap_overrides','select') or has_table_privilege('authenticated','public.account_prompt_cap_overrides','insert') or has_table_privilege('authenticated','public.account_prompt_cap_overrides','update') or has_table_privilege('authenticated','public.account_prompt_cap_overrides','delete') or has_table_privilege('authenticated','public.account_prompt_cap_overrides','truncate') or has_table_privilege('authenticated','public.account_prompt_cap_overrides','references') or has_table_privilege('authenticated','public.account_prompt_cap_overrides','trigger') or has_any_column_privilege('authenticated','public.account_prompt_cap_overrides','select') or has_any_column_privilege('authenticated','public.account_prompt_cap_overrides','insert') or has_any_column_privilege('authenticated','public.account_prompt_cap_overrides','update'))
      and not (has_table_privilege('anon','public.account_prompt_cap_overrides','select') or has_table_privilege('anon','public.account_prompt_cap_overrides','insert') or has_table_privilege('anon','public.account_prompt_cap_overrides','update') or has_table_privilege('anon','public.account_prompt_cap_overrides','delete') or has_table_privilege('anon','public.account_prompt_cap_overrides','truncate') or has_table_privilege('anon','public.account_prompt_cap_overrides','references') or has_table_privilege('anon','public.account_prompt_cap_overrides','trigger') or has_any_column_privilege('anon','public.account_prompt_cap_overrides','select') or has_any_column_privilege('anon','public.account_prompt_cap_overrides','insert') or has_any_column_privilege('anon','public.account_prompt_cap_overrides','update')) end as b_overrides_closed,
    case when to_regprocedure('public.account_prompt_cap(uuid)') is null or to_regprocedure('public.enforce_prompt_pool()') is null then false else
      not has_function_privilege('authenticated','public.account_prompt_cap(uuid)','execute')
      and not has_function_privilege('authenticated','public.enforce_prompt_pool()','execute')
      and not has_function_privilege('anon','public.account_prompt_cap(uuid)','execute')
      and not has_function_privilege('anon','public.enforce_prompt_pool()','execute') end as b_functions_closed,
    not exists (select 1 from pg_policy where polrelid='public.project_prompts'::regclass and polcmd = 'a') as a2_no_insert_policy,
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
    coalesce((select md5(prosrc)='306a01c000f93e362b4323bd7be1b604' and prosecdef and proconfig = array['search_path=""']
              from pg_proc where proname='protect_billing_columns' and pronamespace='public'::regnamespace), false) as c_function_ok,
    -- surrounding surface (independent of which option you applied)
    coalesce((select bool_and(relrowsecurity) from pg_class where oid in ('public.profiles'::regclass,'public.project_prompts'::regclass)), false) as s_rls_on,
    not exists (select 1 from pg_trigger where tgrelid='public.project_prompts'::regclass and not tgisinternal
                and tgname not in ('trg_project_prompts_set_updated_at','trg_project_prompts_pool','trg_project_prompts_no_reactivation'))
      and not exists (select 1 from pg_trigger where tgrelid='public.profiles'::regclass and not tgisinternal
                and tgname not in ('trg_profiles_protect_billing_columns','trg_profiles_set_updated_at')) as s_no_extra_triggers,
    (select coalesce(array_agg(polname||'|'||polcmd::text||'|'||polroles::regrole[]::text||'|'||polpermissive::text||'|'||coalesce(pg_get_expr(polqual,polrelid),'')||'|'||coalesce(pg_get_expr(polwithcheck,polrelid),'')), array[]::text[]) from pg_policy where polrelid='public.project_prompts'::regclass) <@ array['prompts_select_owner|r|{authenticated}|true|is_project_owner(project_id)|','prompts_update_owner|w|{authenticated}|true|is_project_owner(project_id)|is_project_owner(project_id)','prompts_insert_owner|a|{authenticated}|true||is_project_owner(project_id)']
      and (select coalesce(array_agg(polname||'|'||polcmd::text||'|'||polroles::regrole[]::text||'|'||polpermissive::text||'|'||coalesce(pg_get_expr(polqual,polrelid),'')||'|'||coalesce(pg_get_expr(polwithcheck,polrelid),'')), array[]::text[]) from pg_policy where polrelid='public.project_prompts'::regclass) @> array['prompts_select_owner|r|{authenticated}|true|is_project_owner(project_id)|','prompts_update_owner|w|{authenticated}|true|is_project_owner(project_id)|is_project_owner(project_id)'] as s_prompt_policies_ok,
    (select coalesce(array_agg(polname||'|'||polcmd::text||'|'||polroles::regrole[]::text||'|'||polpermissive::text||'|'||coalesce(pg_get_expr(polqual,polrelid),'')||'|'||coalesce(pg_get_expr(polwithcheck,polrelid),'')), array[]::text[]) from pg_policy where polrelid='public.profiles'::regclass) <@ array['profiles_select_own|r|{authenticated}|true|(id = auth.uid())|','profiles_update_own|w|{authenticated}|true|(id = auth.uid())|(id = auth.uid())','profiles_insert_own|a|{authenticated}|true||(id = auth.uid())'] and (select coalesce(array_agg(polname||'|'||polcmd::text||'|'||polroles::regrole[]::text||'|'||polpermissive::text||'|'||coalesce(pg_get_expr(polqual,polrelid),'')||'|'||coalesce(pg_get_expr(polwithcheck,polrelid),'')), array[]::text[]) from pg_policy where polrelid='public.profiles'::regclass) @> array['profiles_select_own|r|{authenticated}|true|(id = auth.uid())|','profiles_update_own|w|{authenticated}|true|(id = auth.uid())|(id = auth.uid())','profiles_insert_own|a|{authenticated}|true||(id = auth.uid())'] as s_profile_policies_ok,
    coalesce((select md5(prosrc)='b096af36e83c9b9f57568630bc5e84ef' and prosecdef from pg_proc where proname='is_project_owner' and pronamespace='public'::regnamespace), false) as s_owner_helper_ok,
    not exists (select 1 from pg_db_role_setting s, unnest(s.setconfig) c where c like 'session_replication_role%') as s_no_trigger_off_settings
)
select 'B: trigger present, enabled, BEFORE ROW insert+update of is_active only, no WHEN' as check_name, b_trigger_ok as ok from f
union all select 'B: both functions are the reviewed bodies, SECURITY DEFINER, search_path pinned', b_functions_ok from f
union all select 'B: overrides table has the exact reviewed shape (columns, one PK on user_id, one valid CHECK), RLS on, no policies', b_overrides_shape_ok from f
union all select 'B: anon/authenticated have no table or column privilege at all on overrides', b_overrides_closed from f
union all select 'B: anon/authenticated cannot execute the functions', b_functions_closed from f
union all select 'A2: no INSERT policy on project_prompts (any name)', a2_no_insert_policy from f
union all select 'A2: reactivation trigger and function are the reviewed ones', a2_trigger_ok from f
union all select 'A1: reactivate fn is the reviewed body and service_role only', a1_fn_ok from f
union all select 'C: profiles trigger BEFORE ROW insert+update, all columns, no WHEN, enabled', c_trigger_ok from f
union all select 'C: function is the reviewed body, SECURITY DEFINER, search_path pinned', c_function_ok from f
union all select 'surface: row-level security ON for profiles and project_prompts', s_rls_on from f
union all select 'surface: no trigger other than the expected ones on profiles / project_prompts', s_no_extra_triggers from f
union all select 'surface: project_prompts policies are exactly the expected ones (name, command, roles, expressions)', s_prompt_policies_ok from f
union all select 'surface: profiles policies are exactly the three originals', s_profile_policies_ok from f
union all select 'surface: is_project_owner is the reviewed body', s_owner_helper_ok from f
union all select 'surface: no database/role setting switches triggers off (session_replication_role)', s_no_trigger_off_settings from f
union all select 'informational: md5 auth.role()=' || coalesce((select md5(prosrc) from pg_proc where proname='role' and pronamespace='auth'::regnamespace limit 1),'?')
        || ' auth.uid()=' || coalesce((select md5(prosrc) from pg_proc where proname='uid' and pronamespace='auth'::regnamespace limit 1),'?') || ' (must equal the preflight rows)', true
union all select 'row count prompts_total=' || count(*) || ' active=' || count(*) filter (where is_active) || ' (informational: compare with the preflight; legitimate traffic may change it)', true from public.project_prompts;
