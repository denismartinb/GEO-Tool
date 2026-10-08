#!/usr/bin/env bash
#
# Adversarial verification of the two prompt-pool proposals in
# docs/specs/billing/proposals/prompt-pool/ against a LOCAL, throwaway Postgres.
# Creates and drops its own databases (pp_a_test, pp_b_test). Refuses non-local servers.
#
#   bash scripts/verify-prompt-pool-proposals.sh [A|B|all]
set -uo pipefail
export PGOPTIONS="-c client_min_messages=warning"
cd "$(dirname "$0")/.."

HOST_OK="$(psql -d postgres -Atc "select coalesce(inet_server_addr()::text, 'local') in ('local','127.0.0.1','::1')")"
[ "$HOST_OK" = "t" ] || { echo "Refusing: local Postgres only." >&2; exit 1; }

DIR=docs/specs/billing/proposals/prompt-pool
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ok   $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL $1 (got: $2)"; }
eq()   { [ "$2" = "$3" ] && ok "$1" || bad "$1" "$2 want $3"; }
le()   { [ "$2" -le "$3" ] && ok "$1" || bad "$1" "$2 want <= $3"; }

U1=00000000-0000-0000-0000-0000000000a1
U2=00000000-0000-0000-0000-0000000000a2
P1=00000000-0000-0000-0000-000000000b11
P2=00000000-0000-0000-0000-000000000b12
P3=00000000-0000-0000-0000-000000000b13
PX=00000000-0000-0000-0000-000000000b21   # belongs to U2

mkdb() {
  psql -d postgres -qc "drop database if exists $1" -c "create database $1" >/dev/null
  export PGDATABASE=$1
  psql -v ON_ERROR_STOP=1 -q -f scripts/sql-local-auth-stub.sql >/dev/null
  for f in supabase/migrations/*.sql; do
    psql -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2>&1 || { echo "migration $f failed" >&2; exit 1; }
  done
}
q()  { psql -Atq -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
# Run as an authenticated user / service role (claims set per session, like PostgREST).
as_user() { psql -Atq -v ON_ERROR_STOP=1 -c "set role authenticated; set \"request.jwt.claim.sub\" = '$1'; set \"request.jwt.claim.role\" = 'authenticated'" -c "$2" 2>&1 | tail -1; }
as_user_err() { psql -Atq -v ON_ERROR_STOP=1 -c "set role authenticated; set \"request.jwt.claim.sub\" = '$1'; set \"request.jwt.claim.role\" = 'authenticated'" -c "$2" 2>&1 | grep -E "ERROR|violat|denied|prompt_pool|re-activating" | head -1; }
as_service() { psql -Atq -v ON_ERROR_STOP=1 -c "set role service_role; set \"request.jwt.claim.role\" = 'service_role'" -c "$1" 2>&1 | tail -1; }

seed() { # plan trial_ends_at(sql) sub(sql)
  q "truncate public.project_prompts, public.projects cascade; truncate auth.users cascade;" >/dev/null
  q "insert into auth.users(id,email) values ('$U1','a1@x.test'),('$U2','a2@x.test');" >/dev/null
  # protect_billing_columns (0016) only lets service_role write the billing columns.
  q "set \"request.jwt.claim.role\" = 'service_role'; update public.profiles set current_plan='${1:-pro}', trial_ends_at=${2:-null}, stripe_subscription_id=${3:-null} where id='$U1'; update public.profiles set trial_ends_at=null where id='$U2'" >/dev/null
  q "insert into public.projects(id,owner_user_id,name,domain,brand,country,language) values
     ('$P1','$U1','p1','p1.example','b','ES','es'),('$P2','$U1','p2','p2.example','b','ES','es'),
     ('$P3','$U1','p3','p3.example','b','ES','es'),('$PX','$U2','x','x.example','b','ES','es')" >/dev/null
}
fill() { # owner project n  (as the OWNER via RLS, one statement)
  as_user "$1" "insert into public.project_prompts(project_id,prompt_text) select '$2','prompt number '||g||' for the pool test' from generate_series(1,$3) g"
}
active() { q "select count(*) from public.project_prompts pp join public.projects p on p.id=pp.project_id where p.owner_user_id='${1:-$U1}' and pp.is_active"; }
# Same as fill but keeps the transaction open after the insert, so concurrent writers
# genuinely overlap (without it the processes mostly serialize by accident and a
# missing lock goes unnoticed — verified by removing the lock: these tests then fail).
slow_fill() {
  as_user "$1" "insert into public.project_prompts(project_id,prompt_text) select '$2','prompt number '||g||' for the pool test' from generate_series(1,$3) g; select pg_sleep(0.4)"
}
parallel_fill() { # n_workers rows_each
  local pids=()
  for i in $(seq 1 "$1"); do
    ( slow_fill "$U1" "$P1" "$2" >/dev/null 2>&1 ) & pids+=($!)
  done
  wait "${pids[@]}"
}

# ============================================================ B
testB() {
  echo "== Option B (trigger, DB-derived cap, no service_role) =="
  mkdb pp_b_test
  psql -v ON_ERROR_STOP=1 -q -f $DIR/B_trigger_no_service_role.sql >/dev/null || { bad "B installs" "sql error"; return; }
  ok "B installs on a fresh schema (0001..latest)"

  seed pro; fill $U1 $P1 75 >/dev/null
  eq "B1 pro: 75 sequential-in-one-statement rows accepted" "$(active)" 75
  fill $U1 $P2 1 >/dev/null
  eq "B1 pro: 76th rejected" "$(active)" 75
  eq "B1 error is the stable prompt_pool_full code" "$(as_user_err $U1 "insert into public.project_prompts(project_id,prompt_text) values ('$P3','extra prompt 0000000')" | grep -c prompt_pool_full)" 1

  seed pro; fill $U1 $P1 120 >/dev/null
  eq "B3 one 120-row statement: atomic, none inserted" "$(active)" 0

  seed pro; parallel_fill 12 10
  eq "B2 12 concurrent 10-row writers: exactly 7 win (70), never over 75" "$(active)" 70
  seed pro; parallel_fill 12 1
  eq "B2b 12 concurrent single-row writers: all 12 land under cap" "$(active)" 12
  seed pro; fill $U1 $P1 74 >/dev/null; parallel_fill 12 1
  eq "B2c 74 + 12 concurrent single rows: exactly 75" "$(active)" 75

  seed pro; fill $U1 $P1 75 >/dev/null
  q "update public.project_prompts set is_active=false where project_id='$P1'" >/dev/null
  fill $U1 $P2 75 >/dev/null
  as_user $U1 "update public.project_prompts set is_active=true where project_id='$P1'" >/dev/null
  eq "B4 deactivate 75, add 75, re-activate old over REST: blocked (the 150 attack)" "$(active)" 75

  seed pro; fill $U1 $P1 74 >/dev/null
  q "insert into public.project_prompts(project_id,prompt_text,is_active) select '$P2','inactive prompt '||g||' xxxx',false from generate_series(1,2) g" >/dev/null
  for i in 1 2; do
    ( as_user $U1 "update public.project_prompts set is_active=true where id=(select id from public.project_prompts where project_id='$P2' and not is_active limit 1); select pg_sleep(0.4)" >/dev/null 2>&1 ) &
  done
  ( slow_fill $U1 $P3 1 >/dev/null 2>&1 ) & wait
  eq "B5 reactivation vs insert race at 74: exactly 75" "$(active)" 75

  seed free;    fill $U1 $P1 11 >/dev/null; eq "B6 free: cap 10"    "$(active)" 0
  seed free;    fill $U1 $P1 10 >/dev/null; eq "B6 free: 10 ok"      "$(active)" 10
  seed starter; fill $U1 $P1 26 >/dev/null; eq "B6 starter: 26 refused" "$(active)" 0
  seed starter; fill $U1 $P1 25 >/dev/null; eq "B6 starter: 25 ok"   "$(active)" 25
  seed agency;  fill $U1 $P1 300 >/dev/null; eq "B6 agency: 300 ok"  "$(active)" 300
  seed agency;  fill $U1 $P1 301 >/dev/null; eq "B6 agency: 301 refused" "$(active)" 0
  seed pro "now() - interval '1 day'"; fill $U1 $P1 11 >/dev/null
  eq "B6 trial elapsed, no subscription: derived plan free (cap 10)" "$(active)" 0
  seed pro "now() - interval '1 day'" "'sub_x'"; fill $U1 $P1 75 >/dev/null
  eq "B6 trial elapsed but paying subscription: pro (75)" "$(active)" 75
  seed pro "now() + interval '3 days'"; fill $U1 $P1 75 >/dev/null
  eq "B6 trial running: pro (75)" "$(active)" 75
  seed pro
  eq "B6 account_prompt_cap(pro)" "$(q "select public.account_prompt_cap('$U1')")" 75
  eq "B6 account_prompt_cap(no profile) fails closed" "$(q "select public.account_prompt_cap(gen_random_uuid())")" 10
  seed pro; q "insert into public.account_prompt_cap_overrides(user_id,cap) values ('$U1',300)" >/dev/null
  fill $U1 $P1 200 >/dev/null; eq "B7 override (comped): 200 ok" "$(active)" 200
  q "update public.account_prompt_cap_overrides set cap=5 where user_id='$U1'" >/dev/null
  fill $U1 $P2 1 >/dev/null; eq "B7 override lowers the cap below usage: grows no more" "$(active)" 200

  echo "-- privilege / escalation"
  seed pro
  eq "B8 authenticated cannot read overrides" "$(as_user_err $U1 "select * from public.account_prompt_cap_overrides" | grep -c 'permission denied')" 1
  eq "B8 authenticated cannot write overrides" "$(as_user_err $U1 "insert into public.account_prompt_cap_overrides(user_id,cap) values ('$U1',10000)" | grep -c 'permission denied')" 1
  eq "B8 authenticated cannot call account_prompt_cap" "$(as_user_err $U1 "select public.account_prompt_cap('$U1')" | grep -c 'permission denied')" 1
  eq "B8 authenticated cannot call the trigger function" "$(as_user_err $U1 "select public.enforce_prompt_pool()" | grep -c 'permission denied')" 1
  eq "B8 authenticated cannot drop the trigger" "$(as_user_err $U1 "drop trigger trg_project_prompts_pool on public.project_prompts" | grep -c 'must be owner')" 1
  eq "B8 authenticated cannot disable the trigger" "$(as_user_err $U1 "alter table public.project_prompts disable trigger trg_project_prompts_pool" | grep -c 'must be owner')" 1
  eq "B8 cannot raise own plan to dodge the cap" "$(as_user_err $U1 "update public.profiles set current_plan='agency' where id='$U1'" | grep -c .)" 1
  eq "B8 cannot insert into another account's project" "$(as_user_err $U1 "insert into public.project_prompts(project_id,prompt_text) values ('$PX','not my project 000000')" | grep -c 'row-level security')" 1
  eq "B8 cannot SET session_replication_role to skip triggers" "$(as_user_err $U1 "set session_replication_role = replica" | grep -c 'permission denied')" 1
  fill $U1 $P1 3 >/dev/null
  eq "B8 a spoofed jwt claim does not change the cap (cap is DB-derived)" "$(as_user $U1 "select set_config('request.jwt.claim.cap','9999',false)" >/dev/null; fill $U1 $P1 80 >/dev/null; active)" 3

  echo "-- service_role is bounded too"
  seed pro
  eq "B9 service_role 76 rows refused" "$(as_service "insert into public.project_prompts(project_id,prompt_text) select '$P1','svc prompt '||g||' xxxxx' from generate_series(1,76) g" >/dev/null; active)" 0

  echo "-- grandfathering and normal edits"
  seed pro; q "alter table public.project_prompts disable trigger trg_project_prompts_pool" >/dev/null
  q "insert into public.project_prompts(project_id,prompt_text) select '$P1','legacy prompt '||g||' xxxxx' from generate_series(1,90) g" >/dev/null
  q "alter table public.project_prompts enable trigger trg_project_prompts_pool" >/dev/null
  as_user $U1 "update public.project_prompts set prompt_text='edited prompt text ok' where id=(select id from public.project_prompts limit 1)" >/dev/null
  eq "B10 grandfathered account can still edit" "$(q "select count(*) from public.project_prompts where prompt_text='edited prompt text ok'")" 1
  as_user $U1 "update public.project_prompts set is_active=false where id in (select id from public.project_prompts limit 20)" >/dev/null
  eq "B10 grandfathered account can deactivate" "$(active)" 70
  fill $U1 $P2 5 >/dev/null; eq "B10 ...and add again once under the cap" "$(active)" 75
  fill $U1 $P2 1 >/dev/null; eq "B10 ...but not above it" "$(active)" 75
  as_user $U1 "delete from public.projects where id='$P1'" >/dev/null 2>&1
  echo "-- compatibility with 0039"
  seed pro; psql -v ON_ERROR_STOP=1 -q -f supabase/migrations/0039_add_project_prompts_pool.sql >/dev/null 2>&1
  eq "B11 0039 function still works under the trigger" "$(as_service "select public.add_project_prompts('$U1','$P1',75,(select jsonb_agg(jsonb_build_object('prompt_text','function prompt '||g||' xx')) from generate_series(1,10) g))" | grep -c '"ok": true')" 1
  eq "B11 ...with an app cap above the derived cap, the trigger still wins" "$(as_service "select public.add_project_prompts('$U1','$P1',9999,(select jsonb_agg(jsonb_build_object('prompt_text','function prompt '||g||' xx')) from generate_series(1,70) g))" | grep -c 'ok": true')" 0
}

# ============================================================ A
testA() {
  echo "== Option A (service_role functions + closure) =="
  mkdb pp_a_test
  psql -v ON_ERROR_STOP=1 -q -f supabase/migrations/0039_add_project_prompts_pool.sql >/dev/null || { bad "A needs 0039" "error"; return; }
  psql -v ON_ERROR_STOP=1 -q -f $DIR/A_service_role_unified.sql >/dev/null || { bad "A installs" "sql error"; return; }
  ok "A installs on top of 0039"
  rowsj() { echo "(select jsonb_agg(jsonb_build_object('prompt_text','function prompt '||g||' xx')) from generate_series(1,$1) g)"; }
  add() { as_service "select public.add_project_prompts('$U1','${2:-$P1}',${3:-75},$(rowsj "$1"))"; }

  seed pro
  add 75 >/dev/null; eq "A1 75 via function" "$(active)" 75
  eq "A1 76th refused" "$(add 1 | grep -c pool_full)" 1
  seed pro; add 120 >/dev/null; eq "A2 one 120-row call is atomic" "$(active)" 0
  seed pro; pids=(); for i in $(seq 1 12); do ( as_service "select public.add_project_prompts('$U1','$P1',75,$(rowsj 10)); select pg_sleep(0.4)" >/dev/null 2>&1 ) & pids+=($!); done; wait "${pids[@]}"
  eq "A3 12 concurrent 10-row calls: exactly 70" "$(active)" 70

  echo "-- reactivation under the same lock"
  seed pro; add 75 >/dev/null
  q "update public.project_prompts set is_active=false where project_id='$P1'" >/dev/null
  add 75 "$P2" >/dev/null
  IDS="(select array_agg(id) from public.project_prompts where project_id='$P1')"
  eq "A4 service reactivation over the cap refused" "$(as_service "select public.reactivate_project_prompts('$U1',$IDS,75)" | grep -c pool_full)" 1
  q "update public.project_prompts set is_active=false where project_id='$P2' and id in (select id from public.project_prompts where project_id='$P2' limit 10)" >/dev/null
  eq "A4 ...fits once there is room (10)" "$(as_service "select public.reactivate_project_prompts('$U1',(select array_agg(id) from (select id from public.project_prompts where project_id='$P1' limit 10) s),75)" | grep -c 'ok": true')" 1
  eq "A4 ...pool is exactly full" "$(active)" 75
  eq "A4 cross-owner ids are ignored" "$(as_service "select public.reactivate_project_prompts('$U2',$IDS,75)" | grep -c '"reactivated": 0')" 1

  echo "-- closure (phase A2)"
  seed pro
  eq "A5 authenticated REST insert refused (policy dropped)" "$(as_user_err $U1 "insert into public.project_prompts(project_id,prompt_text) values ('$P1','rest insert prompt 000')" | grep -c 'row-level security')" 1
  add 5 >/dev/null
  as_user $U1 "update public.project_prompts set is_active=false where project_id='$P1'" >/dev/null
  eq "A5 deactivation by owner still allowed" "$(active)" 0
  eq "A5 REST re-activation refused" "$(as_user_err $U1 "update public.project_prompts set is_active=true where project_id='$P1'" | grep -c 're-activating')" 1
  as_user $U1 "update public.project_prompts set prompt_text='edited by owner ok' where project_id='$P1'" >/dev/null
  eq "A5 owner can still edit text" "$(q "select count(*) from public.project_prompts where prompt_text='edited by owner ok'")" 5
  eq "A6 authenticated cannot execute add_project_prompts" "$(as_user_err $U1 "select public.add_project_prompts('$U1','$P1',9999,$(rowsj 1))" | grep -c 'permission denied')" 1
  eq "A6 authenticated cannot execute reactivate_project_prompts" "$(as_user_err $U1 "select public.reactivate_project_prompts('$U1',array[gen_random_uuid()],9999)" | grep -c 'permission denied')" 1
  eq "A6 anon cannot either" "$(psql -Atq -c "set role anon" -c "select public.add_project_prompts('$U1','$P1',9999,$(rowsj 1))" 2>&1 | grep -c 'permission denied')" 1
  echo "-- A's weak point, demonstrated (caller-supplied cap)"
  seed pro
  eq "A7 a compromised/buggy CALLER passing cap=9999 is believed (why B derives the cap in SQL)" "$(add 100 "$P1" 9999 >/dev/null; active)" 100
  echo "-- rollback restores 0002 behaviour"
  q "drop trigger trg_project_prompts_no_reactivation on public.project_prompts; drop function public.prevent_prompt_reactivation(); create policy prompts_insert_owner on public.project_prompts for insert to authenticated with check (public.is_project_owner(project_id));" >/dev/null
  fill $U1 $P2 1 >/dev/null; eq "A8 after rollback REST insert works again" "$(q "select count(*) from public.project_prompts where project_id='$P2'")" 1
}

case "${1:-all}" in
  A) testA ;; B) testB ;; all) testB; testA ;;
esac
echo; echo "passed=$PASS failed=$FAIL"
psql -d postgres -qc "drop database if exists pp_a_test" -c "drop database if exists pp_b_test" >/dev/null 2>&1
[ "$FAIL" -eq 0 ]
