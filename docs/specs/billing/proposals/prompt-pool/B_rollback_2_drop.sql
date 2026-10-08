-- Rollback of Option B, STEP 2 (optional, later, quiet window): remove the objects for good.
-- DROP TRIGGER takes ACCESS EXCLUSIVE on project_prompts: every read queues behind it up to lock_timeout.
-- Dropping the overrides table LOSES its rows: export them first (RUNBOOK.md §4). Do NOT paste this file
-- together with step 1.
begin;
set local lock_timeout = '3s';
drop trigger if exists trg_project_prompts_pool on public.project_prompts;
-- Uncomment to remove step 1's objects as well:
-- drop function if exists public.enforce_prompt_pool();
-- drop function if exists public.account_prompt_cap(uuid);
-- drop table if exists public.account_prompt_cap_overrides;
commit;
