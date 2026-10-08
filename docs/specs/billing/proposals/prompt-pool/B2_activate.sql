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

-- Refuse to activate without C: without it an account that has no profile row can insert its own as
-- 'agency' and obtain cap 300 (RUNBOOK.md §2, finding 1).
do $$
begin
  if not exists (
    select 1 from pg_proc p
    where p.proname = 'protect_billing_columns' and p.pronamespace = 'public'::regnamespace
      and md5(p.prosrc) = '51223ea4a5bed224b0af362ff1a4fa6c'
  ) or not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.profiles'::regclass and t.tgname = 'trg_profiles_protect_billing_columns'
      and (t.tgtype & 4) <> 0
  ) then
    raise exception 'C_profiles_guards.sql is not applied (or is not the reviewed version): refusing to activate B2';
  end if;
end $$;

create trigger trg_project_prompts_pool
  before insert or update of is_active on public.project_prompts
  for each row execute function public.enforce_prompt_pool();

commit;
