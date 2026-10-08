-- PROPOSAL — NOT A MIGRATION. Option B, STEP 2 of 2: ACTIVATION. This one statement is the only
-- thing that changes behaviour. Run only after B1, the override rows (RUNBOOK.md) and C.
-- Tested ONLY against a local Postgres. Owner-run.
--
-- Plain CREATE TRIGGER (no DROP … IF EXISTS): re-running it fails with "already exists" instead of
-- silently taking an ACCESS EXCLUSIVE lock on project_prompts to replace the trigger.
-- CREATE TRIGGER takes SHARE ROW EXCLUSIVE on project_prompts: writes wait, reads do not, but any
-- pending write queues readers behind it for up to lock_timeout. Run in a quiet window.
--
-- GRANDFATHERING: existing rows are never touched. An account above its derived cap can still edit
-- and deactivate; it just cannot add or re-activate until back under the cap.
-- NOT covered (older, separate): inactive rows are unlimited (5,000 were inserted over REST in the
-- review); a multi-row "swap" UPDATE is accepted or refused depending on row order.

begin;
set local lock_timeout = '3s';

create trigger trg_project_prompts_pool
  before insert or update of is_active on public.project_prompts
  for each row execute function public.enforce_prompt_pool();

commit;
