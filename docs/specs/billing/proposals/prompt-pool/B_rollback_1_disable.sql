-- Rollback of Option B, STEP 1: DISABLE the trigger. This is the complete behavioural rollback: it changes no
-- row, takes only SHARE ROW EXCLUSIVE on project_prompts (reads keep working) and is reversible with
--   alter table public.project_prompts enable trigger trg_project_prompts_pool;
-- ... but ONLY while C is still installed: re-enabling bypasses B2's guard. C_rollback.sql refuses while this trigger
-- exists, so the supported order is B_rollback_1 -> B_rollback_2 -> C_rollback, never C first.
-- Run THIS file first, alone.
begin;
set local lock_timeout = '3s';
alter table public.project_prompts disable trigger trg_project_prompts_pool;
commit;
