-- Rollback of Option B. Disabling the trigger is the complete behavioural rollback and changes no
-- row. ALTER TABLE ... DISABLE TRIGGER takes only SHARE ROW EXCLUSIVE on project_prompts (reads keep
-- working); DROP TRIGGER would take ACCESS EXCLUSIVE and queue every read behind it.
-- Dropping the overrides table LOSES its rows: export them first (RUNBOOK.md).
-- 1) Instant, reversible (re-enable with: alter table public.project_prompts enable trigger trg_project_prompts_pool):
begin;
set local lock_timeout = '3s';
alter table public.project_prompts disable trigger trg_project_prompts_pool;
commit;
-- 2) Later, in a quiet window, to remove it for good:
begin;
set local lock_timeout = '3s';
drop trigger if exists trg_project_prompts_pool on public.project_prompts;
-- Uncomment to remove step 1 as well:
-- drop function if exists public.enforce_prompt_pool();
-- drop function if exists public.account_prompt_cap(uuid);
-- drop table if exists public.account_prompt_cap_overrides;
commit;
