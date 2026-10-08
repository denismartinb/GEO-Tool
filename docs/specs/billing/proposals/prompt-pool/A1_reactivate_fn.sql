-- PROPOSAL — NOT A MIGRATION. Option A, PHASE A1: additive reactivation function (service_role only).
-- Depends on 0039 (add_project_prompts). Tested ONLY against a local Postgres. Owner-run.
--
-- Option A trusts the CALLER's cap, and only service_role may execute the functions, so it needs
-- service_role in the user flow (NOT approved; CLAUDE.md "service-role shortcuts"). It also inherits
-- a boundary that does not hold today: the app decides "comped" from `profiles.email`, which an
-- owner can rewrite (see C_profiles_guards.sql, HOLE 2). Without C, option A's cap can be forged by
-- editing one's own email to a comped address.

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

  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'prompt_pool requires READ COMMITTED' using errcode = '0A000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('prompt_pool:' || p_owner::text, 0));

  select count(*) into v_active
  from public.project_prompts pp
  join public.projects p on p.id = pp.project_id
  where p.owner_user_id = p_owner and pp.is_active;

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
