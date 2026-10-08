#!/usr/bin/env bash
#
# CONTRACT-99 B2 — direct-access (REST-equivalent) tests for project_prompts, against a
# LOCAL Postgres only. Phase A shows the bypass with today's RLS (0002); Phase B applies
# docs/specs/billing/proposals/0040_close_project_prompts_rest_writes.sql and shows it
# closed WITHOUT breaking what the product legitimately does; the proposal is then rolled
# back so the database is left as found.
#
# Prerequisites (disposable local database): stub auth schema whose auth.uid()/auth.role()
# read request.jwt.claim.sub / request.jwt.claim.role (as Supabase's do), roles
# anon/authenticated/service_role, then migrations 0001, 0002 and 0039.
#   PGDATABASE=pool_rls_test bash scripts/verify-prompt-rls-sql.sh
set -euo pipefail
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"

HOST_OK="$(psql -Atc "select coalesce(inet_server_addr()::text, 'local') in ('local','127.0.0.1','::1')")"
[ "$HOST_OK" = "t" ] || { echo "Refusing to run: local Postgres only." >&2; exit 1; }

PROPOSAL="$(dirname "$0")/../docs/specs/billing/proposals/0040_close_project_prompts_rest_writes.sql"
OWNER_A=00000000-0000-0000-0000-00000000000a
OWNER_B=00000000-0000-0000-0000-00000000000b
PROJECT_A=00000000-0000-0000-0000-000000000111
CAP=75

q() { psql -Atq -v ON_ERROR_STOP=1 -c "$1"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

# Run SQL as a Supabase-style session: role + JWT claims, inside one transaction.
as_session() { # role uid sql
  psql -Atq -v ON_ERROR_STOP=1 <<SQL
begin;
set local role $1;
select set_config('request.jwt.claim.sub', '$2', true);
select set_config('request.jwt.claim.role', '$1', true);
$3
commit;
SQL
}
allowed() { as_session "$1" "$2" "$3" >/dev/null 2>&1; }          # exit 0 if the statement is permitted
denied()  { ! as_session "$1" "$2" "$3" >/dev/null 2>&1; }         # exit 0 if it is refused

active() { q "select count(*) from public.project_prompts pp join public.projects p on p.id=pp.project_id where p.owner_user_id='$OWNER_A' and pp.is_active"; }

rows() { python3 - "$1" "$2" <<'PY'
import json, sys
n, tag = int(sys.argv[1]), sys.argv[2]
print(json.dumps([{"prompt_text": f"{tag} prompt number {i:04d} for rls test", "category": "c", "sort_order": i} for i in range(n)]))
PY
}
pool_add() { q "select public.add_project_prompts('$OWNER_A','$PROJECT_A',$CAP,'$(rows "$1" "$2")'::jsonb)" >/dev/null; }

reset() {
  q "truncate public.project_prompts, public.projects cascade; truncate auth.users cascade;" >/dev/null
  q "insert into auth.users(id) values ('$OWNER_A'), ('$OWNER_B');" >/dev/null
  q "insert into public.projects(id, owner_user_id, name, domain, brand, country, language)
     values ('$PROJECT_A','$OWNER_A','a','a.example','b','ES','es'),
            ('00000000-0000-0000-0000-000000000199','$OWNER_B','b','b.example','b','ES','es');" >/dev/null
}

echo "== Phase A: today's RLS (0002) — the pool can be bypassed over the API"
reset
pool_add 75 old
[ "$(active)" = "75" ] || fail "setup: expected 75 active"
allowed authenticated "$OWNER_A" "insert into public.project_prompts(project_id, prompt_text) values ('$PROJECT_A','direct insert past the cap, via REST');" \
  || fail "A1: expected the direct insert to be PERMITTED today"
[ "$(active)" = "76" ] || fail "A1: expected 76 active"
echo "   A1 direct INSERT past the cap: permitted -> $(active) active (cap $CAP)"

reset
pool_add 75 old
allowed authenticated "$OWNER_A" "update public.project_prompts set is_active=false;" || fail "A2 setup: owner must be able to deactivate"
pool_add 75 new
[ "$(active)" = "75" ] || fail "A2 setup: expected 75 active after the function refilled the pool"
allowed authenticated "$OWNER_A" "update public.project_prompts set is_active=true where prompt_text like 'old%';" \
  || fail "A2: expected re-activation to be PERMITTED today"
[ "$(active)" = "150" ] || fail "A2: expected 150 active, got $(active)"
echo "   A2 re-activating 75 old prompts over the API: permitted -> $(active) active (cap $CAP)"

echo "== Phase B: with the proposal applied"
psql -Atq -v ON_ERROR_STOP=1 -f "$PROPOSAL"
trap 'psql -Atq -c "create policy prompts_insert_owner on public.project_prompts for insert to authenticated with check (public.is_project_owner(project_id))" >/dev/null 2>&1 || true; psql -Atq -c "drop trigger if exists trg_project_prompts_no_reactivation on public.project_prompts; drop function if exists public.prevent_prompt_reactivation();" >/dev/null 2>&1 || true' EXIT

reset
pool_add 75 old
denied authenticated "$OWNER_A" "insert into public.project_prompts(project_id, prompt_text) values ('$PROJECT_A','direct insert past the cap, via REST');" \
  || fail "B1: a direct INSERT must be refused"
[ "$(active)" = "75" ] || fail "B1: still 75 active"
echo "   B1 direct INSERT: refused"

allowed authenticated "$OWNER_A" "update public.project_prompts set is_active=false where prompt_text like 'old prompt number 000%';" \
  || fail "B2: the owner must still be able to deactivate (deactivatePrompt)"
echo "   B2 deactivating: still allowed ($(active) active)"

allowed authenticated "$OWNER_A" "update public.project_prompts set category='edited' where is_active;" \
  || fail "B3: editing text/category must stay allowed"
echo "   B3 editing category: still allowed"

denied authenticated "$OWNER_A" "update public.project_prompts set is_active=true where prompt_text like 'old prompt number 000%';" \
  || fail "B4: re-activating over the API must be refused"
echo "   B4 re-activation over the API: refused"

pool_add 5 more
echo "   B5 the pool function (service path) still works: $(active) active"

allowed service_role "$OWNER_A" "update public.project_prompts set is_active=true where prompt_text like 'old prompt number 0000%';" \
  || fail "B6: the service role must still be able to re-activate"
echo "   B6 re-activation by the service role: allowed (deliberate, server-side)"

[ "$(as_session authenticated "$OWNER_B" "select count(*) from public.project_prompts;" | tail -1)" = "0" ] \
  || fail "B7: another account must still see none of these prompts"
echo "   B7 another account sees none of them (RLS select unchanged)"

echo "ALL CHECKS PASSED (the proposal is rolled back on exit)"
