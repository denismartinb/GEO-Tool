-- 0039_add_project_prompts_pool.sql
--
-- Phase: CONTRACT-99 block B2 (log §237) — the 75-prompt pool, ENFORCED.
-- PROPOSAL ONLY: written and tested against a LOCAL Postgres; not applied to any
-- shared or production database. Applying it is the owner's separate gate.
-- Apply manually in the Supabase SQL editor, after 0038 if that one is applied.
--
-- Why: the account-wide prompt cap was only ever checked in application code as
-- a read followed by a write. Two simultaneous writers both read "74" and both
-- insert, so the pool overshoots; `createProject` never subtracted the prompts
-- an account already had; one server action inserted with no check at all. The
-- RLS policy `prompts_insert_owner` additionally lets an owner insert straight
-- through the REST API, so no application-level check can be authoritative.
--
-- What this adds: ONE function that counts the owner's active prompts across ALL
-- their projects and inserts the new rows in the same transaction, under a
-- per-account advisory lock, so concurrent callers are serialized and the cap
-- cannot be exceeded by this path. The application passes the cap it computed
-- from the owner's EFFECTIVE plan (trial expiry, comped accounts), which SQL
-- cannot know; that is safe because only the service role may execute it.
--
-- What this does NOT do (separate, riskier, needs its own approval): it does not
-- change RLS, so an owner can still insert prompts through the REST API and
-- bypass the pool. Closing that means dropping/limiting `prompts_insert_owner`
-- and the owner's ability to re-activate prompts; see
-- docs/specs/billing/contract-99-implementation.md §B2.
--
-- Counting scope: every ACTIVE prompt of every project of the owner, archived
-- projects included — the same scope the application already used (RLS-scoped
-- count with no archived filter). Whether archived domains should count is an
-- open product question (Q4), not decided here.

create or replace function public.add_project_prompts(
  p_owner uuid,
  p_project uuid,
  p_cap integer,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active integer;
  v_wanted integer;
  v_ids jsonb;
begin
  -- The service role bypasses RLS, so ownership is checked here, explicitly.
  if not exists (
    select 1 from public.projects where id = p_project and owner_user_id = p_owner
  ) then
    return jsonb_build_object('ok', false, 'reason', 'project_not_found');
  end if;

  if p_cap is null or p_cap < 0 or p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  v_wanted := jsonb_array_length(p_rows);
  if v_wanted = 0 then
    return jsonb_build_object('ok', true, 'inserted', 0);
  end if;

  -- One lock per ACCOUNT, held until this transaction ends: every writer of the
  -- pool queues here, so the count below is the count the insert will see.
  perform pg_advisory_xact_lock(hashtextextended('prompt_pool:' || p_owner::text, 0));

  select count(*) into v_active
  from public.project_prompts pp
  join public.projects p on p.id = pp.project_id
  where p.owner_user_id = p_owner
    and pp.is_active;

  if v_active + v_wanted > p_cap then
    return jsonb_build_object(
      'ok', false,
      'reason', 'pool_full',
      'active', v_active,
      'cap', p_cap,
      'remaining', greatest(p_cap - v_active, 0)
    );
  end if;

  -- The callers launch a scan for exactly the prompts they just added, so the
  -- new ids travel back with the answer.
  with ins as (
    insert into public.project_prompts (project_id, prompt_text, category, sort_order)
    select
      p_project,
      r ->> 'prompt_text',
      nullif(r ->> 'category', ''),
      coalesce((r ->> 'sort_order')::integer, 0)
    from jsonb_array_elements(p_rows) as r
    returning id
  )
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ids from ins;

  return jsonb_build_object(
    'ok', true,
    'inserted', jsonb_array_length(v_ids),
    'ids', v_ids,
    'active', v_active + jsonb_array_length(v_ids)
  );
end;
$$;

-- Only trusted server code (service role) may call it: it takes the cap as an
-- argument, so exposing it to `authenticated` would let any user pass a huge one.
revoke all on function public.add_project_prompts(uuid, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.add_project_prompts(uuid, uuid, integer, jsonb) to service_role;
