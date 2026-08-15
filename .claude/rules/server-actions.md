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
- **A precondition checked by an owner-scoped action must live in a shared,
  importable function if any other caller needs the same check** — never
  copy-pasted. `setRecurringScans`/`setAutoAuditHalf`'s preconditions moved to
  `lib/projects/automation-toggles.ts` specifically so `/admin`'s
  operator-scoped write (ADMIN-CONSOLE-2b) could call the exact same check
  instead of re-deriving it; two independent implementations of "does this
  project qualify" drift apart silently the first time one of them is edited
  (`docs/brand/design-decisions-log.md` §79).
