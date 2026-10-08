-- PROPOSAL — NOT A MIGRATION. Option A, PHASE A2: closure of the two REST bypasses.
-- Equivalent to ../0040_close_project_prompts_rest_writes.sql. Tested ONLY against a local Postgres.
-- Owner-run, ONLY after the application that routes every write through the functions is live:
-- older code that inserts with a user client breaks the moment this lands.
--
-- COSTS, stated:
--  * DROP POLICY takes ACCESS EXCLUSIVE on project_prompts (measured on PG16): reads queue behind it
--    for up to lock_timeout. Quiet window.
--  * The reactivation trigger refuses everyone but service_role — INCLUDING the SQL editor's
--    `postgres` role (auth.role() is NULL there). An operator fixing a row by hand must disable the
--    trigger for that statement.
--  * Inactive rows stay unlimited via the owner's update policy; and an owner can still deactivate.

begin;
set local lock_timeout = '3s';

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

create trigger trg_project_prompts_no_reactivation
  before update of is_active on public.project_prompts
  for each row execute function public.prevent_prompt_reactivation();

commit;
