---
description: Safety invariants for Next.js server actions.
paths:
  - "app/**/actions.ts"
---

# Server Action Rules

These invariants apply automatically when touching server actions. Owned jointly
by `core-flow`, `frontend`, and `data-guardian`.

- **Validate all input** (e.g. with zod) before using it. Reject invalid input
  with a safe redirect/error, never trust raw `FormData`.
- **Scope every DB write** by `owner_user_id` (and `project_id` where relevant).
- **Do not break field names** expected by existing forms — server actions and
  their forms are a contract.
- **Mobile-reliable client triggers**: when a client component triggers a server
  action with confirmation, use `useTransition` + a direct action call, not
  `onSubmit` + `preventDefault` (which is unreliable on mobile).
- **No raw database/provider errors** surfaced to the UI — map to safe messages.
- **No fake success states.** A redirect to `?success=...` must reflect a real
  persisted change.
- Verified destructive actions (e.g. delete) must re-check ownership and
  preconditions server-side, not rely on the UI gating alone.
- **El desenlace se DEVUELVE, no se decide con `redirect()`.** Una action que
  ramifica con `redirect` no es testeable: `redirect` lanza, así que un test
  sólo puede afirmar «lanzó algo», nunca *qué* decidió. Por eso la lógica vive
  en un `*Core` que devuelve un resultado discriminado y la action se limita a
  traducirlo a `revalidatePath` + `redirect`. No es preferencia de estilo: es
  la razón por la que `createProject` pasó meses ejecutando el Core Target Flow
  sin una sola aserción (log §89, ADR 0022). La traducción debe ser una tabla —
  una variante, una redirección— y no interpretar nada.
