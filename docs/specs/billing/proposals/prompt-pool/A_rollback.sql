-- Rollback of Option A. NOTE: `DROP TRIGGER` and `create policy` both take ACCESS EXCLUSIVE on project_prompts
-- for a moment (reads queue behind them up to lock_timeout): quiet window. A2 restores exactly 0002's behaviour; A1 removes the function. No data changes.
begin;
set local lock_timeout = '3s';
drop trigger if exists trg_project_prompts_no_reactivation on public.project_prompts;
drop function if exists public.prevent_prompt_reactivation();
do $$ begin
  if not exists (select 1 from pg_policy where polrelid = 'public.project_prompts'::regclass and polname = 'prompts_insert_owner') then
    create policy prompts_insert_owner on public.project_prompts for insert to authenticated
      with check (public.is_project_owner(project_id));
  end if;
end $$;
drop function if exists public.reactivate_project_prompts(uuid, uuid[], integer);
commit;
