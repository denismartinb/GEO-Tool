-- READ-ONLY postflight. ONE statement, ONE result set (the Supabase SQL editor shows only the last result).
-- Every row that belongs to what you applied must say ok = true; rows of options you did NOT apply are expected false.
--
-- IT IS A TRIPWIRE, NOT A PROOF. It pins the objects of this package AND, by definition (function, timing, columns, WHEN
-- clause), every trigger on profiles / project_prompts / projects; the policies of those three tables; row-level security;
-- inheritance and rewrite rules on them; the ownership helper (body, search_path, and that the policies depend on it);
-- the owner of the package's functions; database/role settings that can change behaviour; the signup trigger function;
-- and the overrides table's shape and privileges. It does NOT see: event triggers, publications, extensions, objects in
-- other schemas, the bodies of auth.role()/auth.uid() beyond a fingerprint to compare with the PREFLIGHT, the path where
-- an operator or the service role moves a project (and its active prompts) to another account with
-- `update projects set owner_user_id` (no trigger fires), or anything outside this list. CRLF pasted into the editor
-- changes the md5 and reads false: that fails safe (re-paste with LF).
with
is_active_attnum as (select attnum::text as a from pg_attribute where attrelid='public.project_prompts'::regclass and attname='is_active'),
user_id_attnum as (select attnum from pg_attribute where attrelid = to_regclass('public.account_prompt_cap_overrides') and attname='user_id' and not attisdropped),
tbl_owner as (select relowner from pg_class where oid='public.project_prompts'::regclass),
f as (
  select
    exists (select 1 from pg_trigger t, is_active_attnum x where t.tgrelid='public.project_prompts'::regclass and t.tgname='trg_project_prompts_pool'
            and t.tgenabled='O' and t.tgqual is null and t.tgfoid = to_regproc('public.enforce_prompt_pool')
            and (t.tgtype & 3) = 3 and (t.tgtype & 4) <> 0 and (t.tgtype & 16) <> 0 and (t.tgtype & 40) = 0
            and t.tgattr::text = x.a) as b_trigger_ok,
    coalesce((select bool_and(prosecdef and proconfig = array['search_path=""']
                 and md5(prosrc) = case proname when 'account_prompt_cap' then '497d365cdaaa971c4b3bf5f9d97d6eee' when 'enforce_prompt_pool' then '9fb3050e98dc2b10c9706f2b37e4f64e' end)
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
    coalesce((select md5(prosrc)='3a8bf45188e43ff6dbcccc72dc933d07' and prosecdef and proconfig = array['search_path=""']
              from pg_proc where proname='protect_billing_columns' and pronamespace='public'::regnamespace), false) as c_function_ok,
    -- surrounding surface (independent of which option you applied)
    coalesce((select bool_and(relrowsecurity and not relforcerowsecurity and relkind = 'r') from pg_class where oid in ('public.profiles'::regclass,'public.project_prompts'::regclass,'public.projects'::regclass)), false) as s_rls_on,
    -- every trigger on the three tables is either a pinned set_updated_at trigger or one of the package's own (pinned above)
    not exists (select 1 from pg_trigger t where t.tgrelid in ('public.profiles'::regclass,'public.project_prompts'::regclass,'public.projects'::regclass) and not t.tgisinternal and not (
        (t.tgname in ('trg_profiles_set_updated_at','trg_projects_set_updated_at','trg_project_prompts_set_updated_at')
          and t.tgfoid = 'public.set_updated_at()'::regprocedure and t.tgtype = 19 and t.tgqual is null and t.tgattr::text = '' and t.tgenabled = 'O')
        or (t.tgname = 'trg_project_prompts_pool' and t.tgrelid = 'public.project_prompts'::regclass and t.tgfoid = to_regproc('public.enforce_prompt_pool'))
        or (t.tgname = 'trg_project_prompts_no_reactivation' and t.tgrelid = 'public.project_prompts'::regclass and t.tgfoid = to_regproc('public.prevent_prompt_reactivation'))
        or (t.tgname = 'trg_profiles_protect_billing_columns' and t.tgrelid = 'public.profiles'::regclass and t.tgfoid = to_regproc('public.protect_billing_columns'))))
      and (select count(*) from pg_trigger t where t.tgrelid in ('public.profiles'::regclass,'public.project_prompts'::regclass,'public.projects'::regclass) and t.tgname in ('trg_profiles_set_updated_at','trg_projects_set_updated_at','trg_project_prompts_set_updated_at')) = 3
      and coalesce((select md5(prosrc)='9b1889f56258bf9d6554213c05019c76' and not prosecdef and proconfig is null from pg_proc where oid = 'public.set_updated_at()'::regprocedure), false) as s_triggers_pinned,
    not exists (select 1 from pg_inherits where inhparent in ('public.profiles'::regclass,'public.project_prompts'::regclass,'public.projects'::regclass) or inhrelid in ('public.profiles'::regclass,'public.project_prompts'::regclass,'public.projects'::regclass)
                 or inhparent = coalesce(to_regclass('public.account_prompt_cap_overrides'), 0::oid) or inhrelid = coalesce(to_regclass('public.account_prompt_cap_overrides'), 0::oid))
      and not exists (select 1 from pg_rewrite where ev_class in ('public.profiles'::regclass,'public.project_prompts'::regclass,'public.projects'::regclass) or ev_class = coalesce(to_regclass('public.account_prompt_cap_overrides'), 0::oid)) as s_no_inherit_or_rules,
    (select coalesce(array_agg(polname||'|'||polcmd::text||'|'||polroles::regrole[]::text||'|'||polpermissive::text||'|'||coalesce(pg_get_expr(polqual,polrelid),'')||'|'||coalesce(pg_get_expr(polwithcheck,polrelid),'')), array[]::text[]) from pg_policy where polrelid='public.project_prompts'::regclass) <@ array['prompts_select_owner|r|{authenticated}|true|is_project_owner(project_id)|','prompts_update_owner|w|{authenticated}|true|is_project_owner(project_id)|is_project_owner(project_id)','prompts_insert_owner|a|{authenticated}|true||is_project_owner(project_id)']
      and (select coalesce(array_agg(polname||'|'||polcmd::text||'|'||polroles::regrole[]::text||'|'||polpermissive::text||'|'||coalesce(pg_get_expr(polqual,polrelid),'')||'|'||coalesce(pg_get_expr(polwithcheck,polrelid),'')), array[]::text[]) from pg_policy where polrelid='public.project_prompts'::regclass) @> array['prompts_select_owner|r|{authenticated}|true|is_project_owner(project_id)|','prompts_update_owner|w|{authenticated}|true|is_project_owner(project_id)|is_project_owner(project_id)'] as s_prompt_policies_ok,
    (select coalesce(array_agg(polname||'|'||polcmd::text||'|'||polroles::regrole[]::text||'|'||polpermissive::text||'|'||coalesce(pg_get_expr(polqual,polrelid),'')||'|'||coalesce(pg_get_expr(polwithcheck,polrelid),'')), array[]::text[]) from pg_policy where polrelid='public.profiles'::regclass) <@ array['profiles_select_own|r|{authenticated}|true|(id = auth.uid())|','profiles_update_own|w|{authenticated}|true|(id = auth.uid())|(id = auth.uid())','profiles_insert_own|a|{authenticated}|true||(id = auth.uid())'] and (select coalesce(array_agg(polname||'|'||polcmd::text||'|'||polroles::regrole[]::text||'|'||polpermissive::text||'|'||coalesce(pg_get_expr(polqual,polrelid),'')||'|'||coalesce(pg_get_expr(polwithcheck,polrelid),'')), array[]::text[]) from pg_policy where polrelid='public.profiles'::regclass) @> array['profiles_select_own|r|{authenticated}|true|(id = auth.uid())|','profiles_update_own|w|{authenticated}|true|(id = auth.uid())|(id = auth.uid())','profiles_insert_own|a|{authenticated}|true||(id = auth.uid())'] as s_profile_policies_ok,
    (select coalesce(array_agg(polname||'|'||polcmd::text||'|'||polroles::regrole[]::text||'|'||polpermissive::text||'|'||coalesce(pg_get_expr(polqual,polrelid),'')||'|'||coalesce(pg_get_expr(polwithcheck,polrelid),'')), array[]::text[]) from pg_policy where polrelid='public.projects'::regclass) <@ array['projects_select_owner|r|{authenticated}|true|(owner_user_id = auth.uid())|','projects_update_owner|w|{authenticated}|true|(owner_user_id = auth.uid())|(owner_user_id = auth.uid())','projects_insert_owner|a|{authenticated}|true||(owner_user_id = auth.uid())','projects_delete_owner|d|{authenticated}|true|(owner_user_id = auth.uid())|'] and (select coalesce(array_agg(polname||'|'||polcmd::text||'|'||polroles::regrole[]::text||'|'||polpermissive::text||'|'||coalesce(pg_get_expr(polqual,polrelid),'')||'|'||coalesce(pg_get_expr(polwithcheck,polrelid),'')), array[]::text[]) from pg_policy where polrelid='public.projects'::regclass) @> array['projects_select_owner|r|{authenticated}|true|(owner_user_id = auth.uid())|','projects_update_owner|w|{authenticated}|true|(owner_user_id = auth.uid())|(owner_user_id = auth.uid())','projects_insert_owner|a|{authenticated}|true||(owner_user_id = auth.uid())','projects_delete_owner|d|{authenticated}|true|(owner_user_id = auth.uid())|'] as s_projects_policies_ok,
    coalesce((select md5(prosrc)='b096af36e83c9b9f57568630bc5e84ef' and prosecdef and proconfig = array['search_path=public'] from pg_proc where oid = 'public.is_project_owner(uuid)'::regprocedure), false)
      and (select count(*) from pg_policy p where p.polrelid='public.project_prompts'::regclass
             and exists (select 1 from pg_depend d where d.classid='pg_policy'::regclass and d.objid = p.oid and d.refobjid = 'public.is_project_owner(uuid)'::regprocedure))
          = (select count(*) from pg_policy where polrelid='public.project_prompts'::regclass) as s_owner_helper_ok,
    not exists (select 1 from pg_db_role_setting s, unnest(s.setconfig) c where c ~* '^(session_replication_role|request\.|pgrst\.|search_path|row_security)') as s_no_risky_settings,
    coalesce((select md5(prosrc)='0ccd1cb3c754f92af7b764e1cd685f68' and prosecdef and proconfig = array['search_path=public'] from pg_proc where proname='handle_new_user' and pronamespace='public'::regnamespace), false) as s_signup_fn_ok,
    coalesce((select bool_and(p.proowner = (select relowner from tbl_owner) and exists (select 1 from pg_roles r where r.oid = p.proowner and (r.rolsuper or r.rolbypassrls)))
                from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('protect_billing_columns','account_prompt_cap','enforce_prompt_pool')), false) as s_functions_owner_ok,
    -- the three tables share ONE owner (the function owner), nobody else owns them, and the client roles hold no owner membership or RLS bypass
    (select count(distinct relowner) = 1 and bool_and(relowner = (select relowner from tbl_owner)
        and not exists (select 1 from pg_roles r where r.oid = pg_class.relowner and r.rolname in ('anon','authenticated','service_role')))
        from pg_class where oid in ('public.profiles'::regclass,'public.project_prompts'::regclass,'public.projects'::regclass)) as s_table_owners_ok,
    coalesce((select bool_and(not r.rolbypassrls and not r.rolsuper and not pg_has_role(r.oid, (select relowner from tbl_owner), 'MEMBER'))
                from pg_roles r where r.rolname in ('anon','authenticated')), false) as s_client_roles_ok,
    -- an option's names must be fully pinned or entirely absent; a fake sitting in an unused slot is not an "expected false"
    (not exists (select 1 from pg_trigger where tgname = 'trg_project_prompts_pool' or tgfoid = to_regproc('public.enforce_prompt_pool'))
        and to_regproc('public.enforce_prompt_pool') is null and to_regproc('public.account_prompt_cap') is null) as b_absent,
    ((select count(*) from pg_trigger where tgname = 'trg_project_prompts_pool' or tgfoid = to_regproc('public.enforce_prompt_pool')) = 1) as b_one,
    (not exists (select 1 from pg_trigger where tgname = 'trg_project_prompts_no_reactivation' or tgfoid = to_regproc('public.prevent_prompt_reactivation'))
        and to_regproc('public.prevent_prompt_reactivation') is null and to_regproc('public.reactivate_project_prompts') is null) as a_absent,
    ((select count(*) from pg_trigger where tgname = 'trg_project_prompts_no_reactivation' or tgfoid = to_regproc('public.prevent_prompt_reactivation')) = 1) as a_one
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
union all select 'surface: row-level security ON and not FORCED, plain tables (profiles, project_prompts, projects)', s_rls_on from f
union all select 'surface: every trigger on profiles/project_prompts/projects is pinned by definition (set_updated_at body pinned too)', s_triggers_pinned from f
union all select 'surface: no inheritance and no rewrite rules on those tables or the overrides table', s_no_inherit_or_rules from f
union all select 'surface: project_prompts policies are exactly the expected ones (name, command, roles, expressions)', s_prompt_policies_ok from f
union all select 'surface: profiles policies are exactly the three originals', s_profile_policies_ok from f
union all select 'surface: projects policies are exactly the four originals', s_projects_policies_ok from f
union all select 'surface: is_project_owner is the reviewed body with search_path=public, and every project_prompts policy depends on that exact function', s_owner_helper_ok from f
union all select 'surface: no database/role setting for session_replication_role, request.jwt.*, search_path or row_security', s_no_risky_settings from f
union all select 'surface: handle_new_user (signup) is the reviewed body', s_signup_fn_ok from f
union all select 'surface: package functions are owned by the table owner, which bypasses RLS', s_functions_owner_ok from f
union all select 'surface: profiles, projects and project_prompts have one owner, none of anon/authenticated/service_role', s_table_owners_ok from f
union all select 'surface: anon/authenticated are not superuser, do not bypass RLS and are not members of the table owner', s_client_roles_ok from f
union all select 'B slots: a trigger/function bearing B''s names or functions is either absent everywhere or fully pinned (no stray)', (b_absent or (b_one and b_trigger_ok and b_functions_ok)) from f
union all select 'A slots: a trigger/function bearing A''s names or functions is either absent everywhere or fully pinned (no stray)', (a_absent or (a_one and a2_trigger_ok and a1_fn_ok)) from f
union all select 'informational: fingerprint of auth.role()/auth.uid() (body+config+owner) = ' || coalesce((select string_agg(p.proname || ':' || md5(p.prosrc || coalesce(p.proconfig::text,'') || p.prosecdef::text || p.proowner::text), ' ' order by p.proname, p.oid) from pg_proc p where p.pronamespace='auth'::regnamespace and p.proname in ('role','uid')),'?') || ' (must equal the preflight rows)', true
union all select 'row count prompts_total=' || count(*) || ' active=' || count(*) filter (where is_active) || ' (informational: compare with the preflight; legitimate traffic may change it)', true from public.project_prompts;
