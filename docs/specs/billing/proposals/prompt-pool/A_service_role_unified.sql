-- PROPOSAL — NOT A MIGRATION (lives outside supabase/migrations/ on purpose).
-- Option A of the prompt-pool decision: the pool is enforced by SECURITY DEFINER
-- functions that only `service_role` can execute; the application passes the cap.
-- Tested ONLY against a local Postgres (scripts/verify-prompt-pool-proposals.sh).
-- Never applied to any shared/production database by the agent. Owner-run.
--
-- Depends on: 0001 (project_prompts), 0002 (RLS policies), 0039 (add_project_prompts).
--
-- TWO PHASES, deliberately separable (see RUNBOOK.md for order):
--   PHASE A1 — additive. Adds the reactivation function. Old and new application
--              code both keep working. Safe to apply any time after 0039.
--   PHASE A2 — closure. Removes the two REST bypasses. ONLY after the application
--              that routes every write through the functions is live: older code
--              that inserts with a user client breaks the moment A2 lands.
--
-- Cap source in Option A: the caller. Trust boundary: only service_role executes
-- these functions, so a user can never pass their own cap. The price is that
-- service_role must be used in the user flow — NOT currently approved (CLAUDE.md,
-- "service-role shortcuts"). Option B exists to avoid exactly that.

-- ============================== PHASE A1 ==============================
begin;
set local lock_timeout = '3s';

create or replace function public.reactivate_project_prompts(
  p_owner uuid,
  p_ids uuid[],
  p_cap integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active integer;
  v_to_activate integer;
begin
  if p_cap is null or p_cap < 0 or p_ids is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('prompt_pool:' || p_owner::text, 0));

  select count(*) into v_active
  from public.project_prompts pp
  join public.projects p on p.id = pp.project_id
  where p.owner_user_id = p_owner and pp.is_active;

  -- Only prompts that belong to the owner AND are currently inactive count as new.
  select count(*) into v_to_activate
  from public.project_prompts pp
  join public.projects p on p.id = pp.project_id
  where p.owner_user_id = p_owner and not pp.is_active and pp.id = any (p_ids);

  if v_to_activate = 0 then
    return jsonb_build_object('ok', true, 'reactivated', 0);
  end if;

  if v_active + v_to_activate > p_cap then
    return jsonb_build_object(
      'ok', false, 'reason', 'pool_full',
      'active', v_active, 'cap', p_cap, 'remaining', greatest(p_cap - v_active, 0)
    );
  end if;

  update public.project_prompts pp
     set is_active = true
    from public.projects p
   where p.id = pp.project_id
     and p.owner_user_id = p_owner
     and not pp.is_active
     and pp.id = any (p_ids);

  return jsonb_build_object('ok', true, 'reactivated', v_to_activate, 'active', v_active + v_to_activate);
end;
$$;

revoke all on function public.reactivate_project_prompts(uuid, uuid[], integer) from public, anon, authenticated;
grant execute on function public.reactivate_project_prompts(uuid, uuid[], integer) to service_role;

commit;

-- ============================== PHASE A2 ==============================
begin;
set local lock_timeout = '3s';

-- Closure of the REST bypasses. Same content as ../0040_close_project_prompts_rest_writes.sql,
-- repeated here so Option A is one self-contained file.

drop policy if exists prompts_insert_owner on public.project_prompts;

create or replace function public.prevent_prompt_reactivation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Inside the SECURITY DEFINER functions above the JWT claim is still the caller's
  -- (service_role), so the legitimate path passes; a user's REST PATCH does not.
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

commit;

-- ============================== ROLLBACK ==============================
-- A2 (restores exactly 0002 behaviour):
--   drop trigger if exists trg_project_prompts_no_reactivation on public.project_prompts;
--   drop function if exists public.prevent_prompt_reactivation();
--   create policy prompts_insert_owner on public.project_prompts for insert to authenticated
--     with check (public.is_project_owner(project_id));
-- A1:
--   drop function if exists public.reactivate_project_prompts(uuid, uuid[], integer);
-- No data is changed by any of this; rollback loses nothing.
