---
description: Data integrity, RLS, and ownership invariants for Supabase code.
paths:
  - "supabase/**"
  - "lib/supabase/**"
---

# Supabase / Data Integrity Rules

These invariants apply automatically when touching Supabase code. Owned by the
`data-guardian` agent.

- **Ownership scoping is mandatory.** Every query that reads or writes
  user-owned data must filter by `owner_user_id` (and `project_id` where
  applicable). Never rely on the client to scope.
- **No schema changes without explicit phase approval.** Migrations are
  forbidden unless the founder has approved a dedicated backend phase.
- **No RLS changes without explicit approval.**
- **Every write of `project_prompts` goes through `add_project_prompts`
  (`lib/projects/prompt-pool.ts`), never a direct `.insert()`.** The account-wide
  prompt pool was enforced as a read followed by a write in three places — a
  race by construction (twelve concurrent writers reached 120 against a cap of
  75 in `scripts/verify-prompt-pool-sql.sh`; the function never passed 70). The
  function counts and inserts in one transaction under a per-account advisory
  lock and takes the cap as an argument computed from the EFFECTIVE plan, which
  is why only `service_role` may execute it — exposing it to `authenticated`
  would let any user pass a huge cap. That makes it a **service-role use in a
  user-facing flow**, which this very file forbids without approval: it is a
  founder gate, not a drive-by (`docs/brand/design-decisions-log.md` §237,
  migration 0039, not applied). Open and NOT closed by it: RLS still lets an
  owner insert or re-activate prompts through the REST API; closing that is a
  separate RLS change that needs its own approval.
- **No service-role shortcuts in user-facing flows.** The service role must not
  appear in paths reachable from user requests unless explicitly justified and
  approved. **Lo vigila `tests/service-role-identity.test.ts`** (log §92): todo
  fichero de `app/` que use `createServiceClient()` tiene que establecer
  identidad en servidor —`requireUser`, `requireActiveProject`,
  `isAuthorizedInternalRequest` o la firma de Stripe—, y un fichero nuevo entra
  en el alcance solo. Hoy son cinco formas: la quinta, `verifyUnsubscribeToken`
  (el enlace firmado de baja de un correo), entró el 2026-09-28 porque darse
  de baja no puede exigir sesión (log §232, `.claude/rules/email.md`). Añadir
  una sexta es una decisión, no un trámite: es el momento de preguntarse si
  de verdad hace falta. La guarda ve
  que hay identidad, **no** que se aplique al dato que se toca; eso sigue
  siendo revisión de `data-guardian`.
- **No raw Postgres errors in the UI.** Sanitize and map to safe messages.
- Frontend pages must never leak cross-user data — verify the scoping of every
  `select`.

If a change appears to require any of the forbidden items above, stop and route
to the Director for an explicit backend/schema phase.
