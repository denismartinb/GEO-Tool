-- Rollback of Option B, STEP 1: DISABLE the trigger. This is the complete behavioural rollback: it changes no
-- row, takes only SHARE ROW EXCLUSIVE on project_prompts (reads keep working) and is reversible with
--   alter table public.project_prompts enable trigger trg_project_prompts_pool;
-- Run THIS file first, alone.
begin;
set local lock_timeout = '3s';
alter table public.project_prompts disable trigger trg_project_prompts_pool;
commit;
