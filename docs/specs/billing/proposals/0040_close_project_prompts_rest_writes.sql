-- PROPOSAL — NOT A MIGRATION. Deliberately outside supabase/migrations/ so nothing
-- treats it as approved or applied. Needs the owner's explicit approval ("RLS
-- changes" are forbidden without it, CLAUDE.md) and a data-guardian review.
-- Tested ONLY against a local Postgres: scripts/verify-prompt-rls-sql.sh.
--
-- Problem (CONTRACT-99 B2 is PARTIAL because of this): migration 0039 makes every
-- write that goes through the APPLICATION respect the 75-prompt account pool, but
-- two RLS policies from 0002 let an owner bypass it with plain REST calls:
--   * prompts_insert_owner  -> INSERT into project_prompts, no cap
--   * prompts_update_owner  -> PATCH is_active=true on old prompts, no cap
-- Scenario: deactivate 75 prompts, create 75 through the app, re-activate the
-- first 75 over REST -> 150 active.
--
-- Minimal change (two statements; nothing else in 0002 is touched):
--  1. Drop the insert policy. With RLS on and no insert policy, `authenticated`
--     cannot insert; the service role and the SECURITY DEFINER function
--     add_project_prompts (the only writer after 0039) still can.
--  2. Block RE-activation for everyone except the service role, with a trigger.
--     A policy cannot do it: WITH CHECK only sees the NEW row, and the rule is a
--     transition (inactive -> active). Deactivation (the only thing the app does
--     to existing prompts: deactivatePrompt) and edits to text/category stay allowed.
--
-- Known costs, stated rather than glossed:
--  * Anything that inserted/re-activated prompts with a USER client breaks. A grep of
--    app/ and lib/ finds none after 0039 (the three writers go through the function);
--    an operator using the SQL editor runs as `postgres`, whose auth.role() is NULL,
--    and would be refused too: temporarily disable the trigger for a manual fix.
--  * Restoring an archived project does not touch prompts (is_archived lives on projects).

drop policy if exists prompts_insert_owner on public.project_prompts;

create or replace function public.prevent_prompt_reactivation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_active and not old.is_active and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'project_prompts: re-activating a prompt must go through the account pool'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_project_prompts_no_reactivation on public.project_prompts;
create trigger trg_project_prompts_no_reactivation
  before update of is_active on public.project_prompts
  for each row execute function public.prevent_prompt_reactivation();

-- ROLLBACK (also what the verification script runs to leave the database as it found it):
--   create policy prompts_insert_owner on public.project_prompts for insert to authenticated
--     with check (public.is_project_owner(project_id));
--   drop trigger trg_project_prompts_no_reactivation on public.project_prompts;
--   drop function public.prevent_prompt_reactivation();
