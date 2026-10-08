-- Rollback of Option B. Step 2 alone (drop the trigger) is the complete behavioural rollback and
-- changes no row. DROP TRIGGER takes ACCESS EXCLUSIVE on project_prompts for a moment.
-- Dropping the overrides table LOSES its rows: export them first (RUNBOOK.md).
begin;
set local lock_timeout = '3s';
drop trigger if exists trg_project_prompts_pool on public.project_prompts;
-- Uncomment to remove step 1 as well:
-- drop function if exists public.enforce_prompt_pool();
-- drop function if exists public.account_prompt_cap(uuid);
-- drop table if exists public.account_prompt_cap_overrides;
commit;
