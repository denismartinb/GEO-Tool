-- 0011_signup_plan_from_metadata.sql
--
-- Phase: BILLING-6-signup-plan (founder-approved 2026-07-03)
--
-- Purpose: a new signup now carries the plan chosen on the public /pricing
-- page as Supabase Auth metadata (options.data.plan on signUp()). Previously
-- handle_new_user() (0003_v0_profile_trigger.sql) only inserted id/email, so
-- every new account silently fell back to profiles.current_plan's column
-- default ('pro', from 0010 — chosen to not disrupt existing accounts, never
-- meant to represent a real choice for brand-new signups).
--
-- This updates the trigger to read raw_user_meta_data->>'plan' and use it if
-- (and only if) it is one of the 4 known plan ids — the column's own check
-- constraint would otherwise reject an invalid value and break signup
-- entirely, so the fallback is validated here, not left to the constraint.
-- Anyone signing up without that metadata (e.g. a direct /signup visit, not
-- via /pricing) starts on 'free' — the real self-serve entry point of the
-- product — not 'pro'.
--
-- No RLS changes: this only changes what handle_new_user() inserts; the
-- function is already security definer and unaffected by RLS.
--
-- Apply manually in the Supabase SQL editor, in order, after 0010.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_plan text := new.raw_user_meta_data ->> 'plan';
  resolved_plan text := 'free';
begin
  if requested_plan in ('free', 'starter', 'pro', 'agency') then
    resolved_plan := requested_plan;
  end if;

  insert into public.profiles (id, email, current_plan)
  values (new.id, coalesce(new.email, ''), resolved_plan)
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  return new;
end;
$$;
