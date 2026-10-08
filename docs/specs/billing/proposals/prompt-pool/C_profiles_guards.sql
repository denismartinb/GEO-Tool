-- PROPOSAL — NOT A MIGRATION. Prerequisite of Option B (and a fix in its own right).
-- Tested ONLY against a local Postgres. Needs the owner's approval: it changes a trigger on
-- `profiles` (RLS-adjacent). Found by the independent data-guardian review of the prompt-pool
-- proposals; BOTH holes were reproduced locally before this file was written.
--
-- HOLE 1 — an account WITHOUT a `profiles` row can create its own with any plan.
--   0016/0017/0019's trigger runs on UPDATE only; policy `profiles_insert_own` lets a user INSERT
--   `(id = auth.uid())` with `current_plan='agency'`, any `trial_ends_at`, any `stripe_*`.
--   Reachable only by accounts with no profile row (nobody can delete their own: no delete policy;
--   `handle_new_user` creates one at signup) — preflight counts them.
-- HOLE 2 — an owner can rewrite `profiles.email`, and the app decides "comped" from that column
--   (lib/billing.ts resolveEffectivePlanId / resolveSystemPlanId, BILLING-COMPED-1). Anyone who
--   knows a comped address gets Agency caps and every Pro-gated feature by editing their own row.
--   It is wider than billing: `profiles.email` is also the ADDRESS the product mails (weekly digest,
--   score alert, trial-ended, lifecycle sequence) and decides the lifecycle-email exemption, so a
--   rewritten value redirects customer mail to any address.
--
-- WHAT IS AND IS NOT ESTABLISHED. The shape of both holes comes from the repo's own migrations and
-- policies (0002 profiles_insert_own / profiles_update_own, 0016-0019 guard without email, lib/billing.ts
-- comped by profiles.email) and was REPRODUCED against a local Postgres built from them. Whether the LIVE
-- Supabase database is in that state, and whether anyone has exploited it, has NOT been verified from
-- here: preflight rows "6" and "7b" measure it read-only, in aggregate, without emails.
--
-- WHAT C DOES NOT DO: it blocks FUTURE writes only. A `profiles.email` already altered stays altered, and
-- the app keeps trusting it for "comped" until the identity source is changed (RUNBOOK.md §9). C neither
-- repairs nor deletes anything; it must not be read as having cleaned the data.
--
-- WHO WRITES profiles.email AND WHAT C DOES TO EACH (checked against the code and migrations):
--   * signup (handle_new_user, trigger on auth.users)   -> runs from the auth service with no
--       `authenticated` claim: unaffected, still creates the row with the 7-day trial (0017).
--   * Stripe webhook / changePlan                        -> service role, and they do not write email: unaffected.
--   * Supabase SQL editor (role `postgres`)              -> auth.role() is NULL: the email guard does NOT apply,
--       so an operator CAN reconcile an email by hand (template in RUNBOOK.md §9, never run by the agent).
--   * a legitimate change of email by the user           -> the app has NO such flow (auth.updateUser is used
--       for the password and user_metadata only), and nothing syncs auth.users.email -> profiles.email on update. If a flow is added,
--       its server side must write profiles.email with the service role. Until then a user whose profile
--       email is wrong cannot fix it themselves: C makes that limitation explicit (clear error), it does not
--       hide it, and the operator path above exists.
--
-- Fix, minimal and limited to the `authenticated` role (a user JWT). Server-side writers keep
-- working unchanged: the service role (webhook, changePlan) and signup's `handle_new_user`, which
-- runs from the auth service with no `authenticated` claim.
--   * INSERT by `authenticated`: billing columns are forced to the Free defaults and `email` is
--     taken from auth.users, never from the request.
--   * UPDATE by `authenticated`: the existing guard (plan, stripe ids, trial, cancel_at) PLUS `email`.
--
-- Also frozen for `authenticated`: `created_at` (see the function), so a profile self-inserted before C cannot
-- erase its own trace afterwards. C still cannot DETECT past abuse: preflight 7c is a presence-only signal.
--
-- Cost, stated: an `authenticated` session can no longer change its own `profiles.email`. Nothing in
-- app/ or lib/ does (grep: no profiles update touches email; the auth.updateUser calls set a
-- password and `user_metadata`, never the email). If an email-change flow is added later, sync it from the server with the service role.
--
-- Depends on: 0002, 0016, 0017, 0019 (the version of protect_billing_columns below is 0019's plus
-- the two guards; check preflight section "profiles trigger" first — if a later migration changed
-- the function, merge instead of pasting).

begin;
set local lock_timeout = '3s';

-- SECURITY DEFINER (new) only so the INSERT branch can read auth.users, which `authenticated` cannot;
-- search_path is pinned and every reference is schema-qualified. The role checks use auth.role(),
-- which reads the request's JWT claim, not the executing role, so nothing else changes.
create or replace function public.protect_billing_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if auth.role() = 'authenticated' then
      new.current_plan := 'free';
      new.stripe_customer_id := null;
      new.stripe_subscription_id := null;
      new.trial_ends_at := null;
      new.cancel_at := null;
      new.email := coalesce((select u.email from auth.users u where u.id = new.id), '');
    end if;
    return new;
  end if;

  if new.current_plan is distinct from old.current_plan
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     or new.trial_ends_at is distinct from old.trial_ends_at
     or new.cancel_at is distinct from old.cancel_at then
    raise exception 'current_plan, stripe_customer_id, stripe_subscription_id, trial_ends_at and cancel_at can only be changed by the service role';
  end if;

  if auth.role() = 'authenticated' and new.email is distinct from old.email then
    raise exception 'email can only be changed by the service role';
  end if;

  -- created_at is the forensic signal of a profile that did not come from signup (preflight 7c): a user
  -- must not be able to rewrite it after the fact.
  if auth.role() = 'authenticated' and new.created_at is distinct from old.created_at then
    raise exception 'created_at can only be changed by the service role';
  end if;

  return new;
end;
$$;

-- CREATE OR REPLACE FUNCTION takes no table lock. The trigger is replaced with CREATE OR REPLACE
-- TRIGGER (PostgreSQL 14+; Supabase runs 15+), which takes only SHARE ROW EXCLUSIVE on `profiles`:
-- writes wait briefly, reads (every login) do not. A plain DROP TRIGGER would take ACCESS EXCLUSIVE.
create or replace trigger trg_profiles_protect_billing_columns
before insert or update on public.profiles
for each row execute function public.protect_billing_columns();

commit;
