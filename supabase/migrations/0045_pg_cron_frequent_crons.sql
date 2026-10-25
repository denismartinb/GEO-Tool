-- 0045_pg_cron_frequent_crons.sql
--
-- Phase: CRON-HOBBY-1 (founder decision 2026-10-25, decision card «¿Cómo
-- resolvemos los crons frecuentes tras bajar a Hobby?» → «Quedarse en Hobby
-- con pg_cron»; docs/brand/design-decisions-log.md §347).
--
-- Purpose: the Vercel account went from Pro to Hobby. Hobby only allows crons
-- that run at most once a day and rejects any deployment whose vercel.json
-- schedules one more often. Four crons ran more often than that, and each one
-- exists because something else cannot do its job:
--
--   /api/cron/scan-continue   every 5 min   re-dispatches scans whose chain of
--                                           self-calls Vercel cut with 508
--                                           (SCAN-CRON-DRAIN-1, log §262)
--   /api/cron/run-audit       every 10 min  drains the web-audit queue, same
--                                           508 reason (AUDIT-CRON-DRAIN-1,
--                                           log §261)
--   /api/cron/seo-serp        every 10 min  weekly Google Top 20, takes what is
--                                           still pending (SEO-TRACK-1, §346)
--   /api/cron/scan-watchdog   every 15 min  reconciles stalled scans and sends
--                                           every operator alert
--                                           (ALERTS-ALWAYS-1, log §227)
--
-- They move here: pg_cron fires on schedule and pg_net calls the same
-- production route with the same `Authorization: Bearer <CRON_SECRET>` header
-- Vercel used to send, so the routes do not change at all. The four daily (or
-- rarer) crons stay in vercel.json.
--
-- The secret is NOT in this file. It lives in Supabase Vault under the name
-- `genscore_cron_secret` and must be the exact value of CRON_SECRET in Vercel
-- Production. Until it exists, every call is skipped with a warning (nothing
-- is sent without the header, so no route ever sees an unauthenticated hit).
--
-- Apply manually in the Supabase SQL editor, after 0044. Then, ONCE, in the
-- same editor (never commit the value):
--
--   select vault.create_secret('<value of CRON_SECRET in Vercel>', 'genscore_cron_secret');
--
-- To rotate later: select vault.update_secret(id, '<new value>') with the id
-- from vault.secrets where name = 'genscore_cron_secret', AND change
-- CRON_SECRET in Vercel to the same value.
--
-- Re-runnable: extensions and schema are `if not exists`, the function is
-- `create or replace`, and cron.schedule() with an existing job name updates
-- that job instead of adding a second one.
--
-- To check it works (Supabase SQL editor):
--   select jobname, schedule, active from cron.job where jobname like 'genscore-%';
--   select status, return_message, start_time from cron.job_run_details
--     order by start_time desc limit 20;
--   select status_code, created from net._http_response order by created desc limit 20;
--
-- To undo: select cron.unschedule(jobname) from cron.job where jobname like 'genscore-%';

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Not exposed through PostgREST (only `public` is), and closed to the API
-- roles anyway: nothing outside pg_cron has a reason to call this.
create schema if not exists internal_cron;
revoke all on schema internal_cron from public, anon, authenticated;

create or replace function internal_cron.call_route(route text)
returns bigint
language plpgsql
as $$
declare
  cron_secret text;
begin
  select decrypted_secret
    into cron_secret
    from vault.decrypted_secrets
   where name = 'genscore_cron_secret'
   limit 1;

  if cron_secret is null or cron_secret = '' then
    raise warning 'internal_cron.call_route(%): vault secret genscore_cron_secret is missing, call skipped', route;
    return null;
  end if;

  -- Fixed production origin, no trailing slash: "https://www.genscore.es//api"
  -- is answered with 508 by Vercel (log §241). The routes run up to 60 s
  -- (maxDuration); the timeout sits above that so pg_net never hangs up on a
  -- pass that is still working.
  return net.http_get(
    url := 'https://www.genscore.es' || route,
    headers := jsonb_build_object('Authorization', 'Bearer ' || cron_secret),
    timeout_milliseconds := 70000
  );
end;
$$;

revoke all on function internal_cron.call_route(text) from public, anon, authenticated;

-- Same schedules vercel.json had. vercel-crons.test.ts reads them from this
-- file, so changing one here without its test fails CI.
select cron.schedule('genscore-scan-continue', '*/5 * * * *', $$select internal_cron.call_route('/api/cron/scan-continue')$$);
select cron.schedule('genscore-run-audit', '*/10 * * * *', $$select internal_cron.call_route('/api/cron/run-audit')$$);
select cron.schedule('genscore-seo-serp', '*/10 * * * *', $$select internal_cron.call_route('/api/cron/seo-serp')$$);
select cron.schedule('genscore-scan-watchdog', '*/15 * * * *', $$select internal_cron.call_route('/api/cron/scan-watchdog')$$);

-- pg_cron keeps one row per run (~600 a day with the schedules above) and the
-- free plan has 500 MB. pg_net already expires its own responses after 6 h.
select cron.schedule(
  'genscore-cron-history-purge',
  '17 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
