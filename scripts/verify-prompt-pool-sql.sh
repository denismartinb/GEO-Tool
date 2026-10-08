#!/usr/bin/env bash
#
# CONTRACT-99 B2 — proves, against a LOCAL Postgres only, that
# public.add_project_prompts (migration 0039) never exceeds the account prompt
# pool under real concurrency, and that the old read-then-write pattern DOES.
#
# Usage (needs a disposable database that already has migration 0001 + 0039 and
# the roles anon/authenticated/service_role — see docs/specs/billing/
# contract-99-implementation.md):
#   PGDATABASE=pool_test bash scripts/verify-prompt-pool-sql.sh
#
# Refuses to run unless the server is local. Never point it at a shared database.
set -euo pipefail
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"

HOST_OK="$(psql -Atc "select coalesce(inet_server_addr()::text, 'local') in ('local','127.0.0.1','::1')")"
if [ "$HOST_OK" != "t" ]; then
  echo "Refusing to run: this script only runs against a local Postgres." >&2
  exit 1
fi

CAP=75
q() { psql -Atq -v ON_ERROR_STOP=1 -c "$1"; }

reset() {
  q "truncate public.project_prompts, public.projects cascade; truncate auth.users cascade;" >/dev/null
  q "insert into auth.users(id) values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');" >/dev/null
  for i in 1 2 3; do
    q "insert into public.projects(id, owner_user_id, name, domain, brand, country, language)
       values ('00000000-0000-0000-0000-00000000011$i', '00000000-0000-0000-0000-00000000000a', 'p$i', 'p$i.example', 'b', 'ES', 'es');" >/dev/null
  done
  q "insert into public.projects(id, owner_user_id, name, domain, brand, country, language)
     values ('00000000-0000-0000-0000-000000000199', '00000000-0000-0000-0000-00000000000b', 'other', 'other.example', 'b', 'ES', 'es');" >/dev/null
}

OWNER_A=00000000-0000-0000-0000-00000000000a
OWNER_B=00000000-0000-0000-0000-00000000000b

rows() { # n rows of valid prompts
  python3 - "$1" <<'PY'
import json, sys
n = int(sys.argv[1])
print(json.dumps([{"prompt_text": f"prompt number {i:04d} for the pool test", "category": "c", "sort_order": i} for i in range(n)]))
PY
}

active() { q "select count(*) from public.project_prompts pp join public.projects p on p.id=pp.project_id where p.owner_user_id='$OWNER_A' and pp.is_active"; }
call() { # project suffix, n rows
  q "select public.add_project_prompts('$OWNER_A', '00000000-0000-0000-0000-00000000011$1', $CAP, '$(rows "$2")'::jsonb)"
}

fail() { echo "FAIL: $*" >&2; exit 1; }

echo "== 1. functional: 25 + 25 + 25 fits, the 76th is refused"
reset
call 1 25 >/dev/null; call 2 25 >/dev/null; call 3 25 >/dev/null
[ "$(active)" = "75" ] || fail "expected 75 active, got $(active)"
OUT="$(call 1 1)"
echo "$OUT" | grep -q '"reason": "pool_full"' || fail "76th should be pool_full, got $OUT"
echo "   ok: $OUT"

echo "== 2. no partial writes: a batch that does not fit inserts NOTHING"
reset
call 1 70 >/dev/null
OUT="$(call 2 10)"
echo "$OUT" | grep -q 'pool_full' || fail "expected pool_full, got $OUT"
[ "$(active)" = "70" ] || fail "a rejected batch must not insert; active=$(active)"
echo "   ok: active stays 70 ($OUT)"

echo "== 3. CONCURRENCY with the function: 12 sessions x 10 rows racing for a pool of $CAP"
for round in 1 2 3; do
  reset
  pids=()
  for s in $(seq 1 12); do
    proj=$(( (s % 3) + 1 ))
    ( call "$proj" 10 >/dev/null ) &
    pids+=($!)
  done
  for pid in "${pids[@]}"; do wait "$pid"; done
  A="$(active)"
  [ "$A" -le "$CAP" ] || fail "round $round: pool exceeded, active=$A > $CAP"
  [ "$A" = "70" ] || fail "round $round: expected exactly 7 batches (70), got $A"
  echo "   round $round: active=$A (<= $CAP)  ok"
done

echo "== 4. CONTROL: the OLD pattern (read the count, then insert) under the same race"
overshoot=0
for round in 1 2 3; do
  reset
  pids=()
  for s in $(seq 1 12); do
    proj=$(( (s % 3) + 1 ))
    (
      # exactly what the application did: check, (think), insert — no shared lock.
      psql -Atq -v ON_ERROR_STOP=1 <<SQL >/dev/null
        do \$\$
        declare c int;
        begin
          select count(*) into c from public.project_prompts pp join public.projects p on p.id=pp.project_id
            where p.owner_user_id='$OWNER_A' and pp.is_active;
          perform pg_sleep(0.3);
          if c < $CAP then
            insert into public.project_prompts(project_id, prompt_text, category)
            select '00000000-0000-0000-0000-00000000011$proj', 'prompt number ' || g || ' for the pool test', 'c'
            from generate_series(1, 10) g;
          end if;
        end \$\$;
SQL
    ) &
    pids+=($!)
  done
  for pid in "${pids[@]}"; do wait "$pid"; done
  A="$(active)"
  echo "   round $round: active=$A (cap $CAP)"
  [ "$A" -gt "$CAP" ] && overshoot=1
done
[ "$overshoot" = "1" ] || fail "control did not overshoot: the race this protects against was not reproduced"
echo "   ok: the old pattern overshoots the cap, the function does not"

echo "== 5. accounts are independent, ownership is enforced, deactivating frees the pool"
reset
call 1 75 >/dev/null
OUT="$(q "select public.add_project_prompts('$OWNER_B', '00000000-0000-0000-0000-000000000199', $CAP, '$(rows 5)'::jsonb)")"
echo "$OUT" | grep -q '"ok": true' || fail "another account must not be blocked: $OUT"
OUT="$(q "select public.add_project_prompts('$OWNER_B', '00000000-0000-0000-0000-000000000111', $CAP, '$(rows 1)'::jsonb)")"
echo "$OUT" | grep -q 'project_not_found' || fail "someone else's project must be refused: $OUT"
q "update public.project_prompts set is_active=false where id in (select id from public.project_prompts limit 5)" >/dev/null
OUT="$(call 2 5)"; echo "$OUT" | grep -q '"ok": true' || fail "deactivating must free the pool: $OUT"
echo "   ok"

echo "== 6. only the service role may execute it"
for role in anon authenticated; do
  if psql -Atq -c "set role $role; select public.add_project_prompts('$OWNER_A','00000000-0000-0000-0000-000000000111',1000,'[]'::jsonb)" >/dev/null 2>&1; then
    fail "$role must not be able to execute add_project_prompts"
  fi
  echo "   $role: permission denied  ok"
done

echo "ALL CHECKS PASSED"
