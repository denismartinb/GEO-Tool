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
- **No service-role shortcuts in user-facing flows.** The service role must not
  appear in paths reachable from user requests unless explicitly justified and
  approved. **Lo vigila `tests/service-role-identity.test.ts`** (log §92): todo
  fichero de `app/` que use `createServiceClient()` tiene que establecer
  identidad en servidor —`requireUser`, `requireActiveProject`,
  `isAuthorizedInternalRequest` o la firma de Stripe—, y un fichero nuevo entra
  en el alcance solo. Añadir una quinta forma a esa lista es una decisión, no un
  trámite: es el momento de preguntarse si de verdad hace falta. La guarda ve
  que hay identidad, **no** que se aplique al dato que se toca; eso sigue
  siendo revisión de `data-guardian`.
- **No raw Postgres errors in the UI.** Sanitize and map to safe messages.
- Frontend pages must never leak cross-user data — verify the scoping of every
  `select`.

If a change appears to require any of the forbidden items above, stop and route
to the Director for an explicit backend/schema phase.
