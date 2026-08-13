---
description: Safety invariants for the operator console (/admin, /mfa).
paths:
  - "app/admin/**"
  - "app/mfa/**"
  - "lib/admin/**"
---

# Operator Console Rules

These invariants apply automatically when touching `/admin`, `/mfa/*`, or
`lib/admin/**`. Every rule here is traceable to
`docs/brand/design-decisions-log.md` §64 (ADMIN-CONSOLE-1). Owned by
`data-guardian` for review, `frontend`/`core-flow` for implementation.

- **The allow-list is a UUID, never an email.** `ADMIN_USER_IDS` compares
  against `auth.users.id`, read from the caller's own verified session —
  never against `profiles.email`, which the account holder can change
  themselves from Ajustes. Never move this check into a database column
  without founder approval (CLAUDE.md's schema-migration gate) — the point of
  an env-var allow-list is that a service-role RLS bypass or SQL injection
  cannot grant a privilege that lives in no table at all.
- **`requireOperator()` is the only gate, and it is session + allow-list +
  `aal2` — all three, every time.** Never add a page or server action under
  `/admin` that skips it, and never weaken it to `requireOperatorCandidate()`
  (session + allow-list, no `aal2`) outside `/mfa/enroll` and
  `/mfa/challenge` — those two exist *only* because bootstrapping MFA cannot
  itself require MFA.
- **A server action under `/admin` or `/mfa` must call the gate itself, not
  rely on the page or layout that rendered its form.** A server action is a
  callable HTTP endpoint independent of the page that renders its `<form>` —
  `.claude/rules/server-actions.md` already says this generally; here it is
  the entire security model, not a defense-in-depth extra.
- **The 404 is for the browser; the operator still gets a log line.** Denying
  access silently makes "variable unset", "wrong UUID" and "someone else
  poking around" indistinguishable — and the person who can fix the first two
  is the one staring at the blank 404. `logDeniedOperatorAccess()` separates
  the misconfiguration case from the real denial in the server logs, and never
  leaks either into the response body. Same rule as
  `.claude/rules/scan.md`'s "a failure the operator can fix must reach the
  operator"; it was written into the ADMIN-CONSOLE-1 proposal, shipped
  missing, and cost an hour on the first real setup
  (`docs/brand/design-decisions-log.md` §64).
- **A non-operator gets `notFound()` (404), never a redirect or a 403.** A
  403 confirms the route exists and is worth attacking; a redirect to
  `/login` reveals the same thing to someone already signed in. 404 says
  nothing. An operator who is merely mid-setup (no `aal2` yet) is the one
  exception — they already know `/admin` exists, so routing them to
  `/mfa/enroll` or `/mfa/challenge` reveals nothing new.
- **Every privileged read goes through the service-role client returned by
  `requireOperator()`, and only that client.** `/admin` exists specifically
  to read data an operator's own RLS-scoped session cannot see (every
  account's `profiles` row, `last_sign_in_at` via
  `service.auth.admin.listUsers()`). Never construct `createServiceClient()`
  directly inside an `/admin` page or action — go through the gate so a
  future edit can't accidentally skip it.
- **Fase 1 is read-only. Any write beyond MFA enrollment itself (changing a
  plan, editing a project, touching billing) needs its own Task Intake** —
  CLAUDE.md's Task Intake Protocol applies in full to `/admin`, same as any
  other auth/server-action surface. Do not add a mutating action here as a
  drive-by.
- **A TOTP secret is shown at most once.** `supabase.auth.mfa.enroll()`
  never returns a factor's `qr_code`/`secret` a second time. A wrong code on
  `/mfa/enroll` must re-challenge the SAME pending (`unverified`) factor —
  never silently re-enroll, which would invalidate the secret the operator
  already scanned into their authenticator app without telling them. Only an
  explicit "generate a new one" action may discard a pending factor.
- **`next` on `/mfa/challenge` is attacker-controlled and must be validated**
  (`lib/admin/safe-next.ts`) before it ever reaches `redirect()` — it is a
  query parameter on a link, not just the value `requireOperator()` sets. An
  unvalidated `next` is an open redirect landing right after a real MFA
  verification, which is a worse place for one than almost anywhere else in
  the app.
- **Validate a redirect target with a URL parser, never with string prefixes,
  and validate the value you are about to RETURN as well as the one you were
  given.** Both halves are scar tissue from the same review (`qa` on PR #387,
  before merge): `startsWith("/") && !startsWith("//")` let `/\evil.example`
  through, because a backslash is a slash to the WHATWG parser every browser
  implements; and resolving-then-returning `pathname` let `/..//evil.example`
  through, because it normalizes to the protocol-relative `//evil.example`
  *inside* the checked origin. Hand-rolled rules keep losing to the parser the
  browser actually runs — resolve against a fixed sentinel origin and demand
  the result still live there, on the way in and on the way out
  (`docs/brand/design-decisions-log.md` §64).
- **No estimated number may be presented as if it were the real one.**
  "MRR estimado" is catalog price × accounts with a real
  `stripe_subscription_id` — it says "estimado" because it is one, and it
  never substitutes for what Stripe actually billed. This is the same "no
  fake metrics" rule as the rest of CLAUDE.md, applied to a screen whose
  entire audience already trusts every other number on it.
- **Check which column is still live before reading it.** `/admin` reads
  columns owned by other subsystems, and some are retired without being
  dropped — `auto_web_audit_enabled` (0030) still exists, still defaults to
  `true`, and is read by nothing since 0031 replaced it with the two audit
  halves. Reading it shipped a screen that would have claimed "auto-audit on,
  costing money" for nearly every account while the truth is off for nearly
  all of them (caught by `qa` on PR #394 before merge, §65). A column that
  exists is not a column that means anything: read the migration that last
  touched it, and match the fail direction the live code uses
  (`=== true` for the halves — they fail closed).
- **A per-project setting may not be rendered as a per-account boolean.** The
  automation toggles (`recurring_scans_enabled`, the two audit halves
  `auto_technical_audit_enabled`/`auto_coverage_audit_enabled`, the engine
  switches) live on `projects`. An account with
  several domains can hold them in conflict, so the account-level view shows a
  declared aggregate (`active/total`) and the real switch is read per project.
  A single checkbox per user is false the moment two projects disagree
  (`docs/brand/design-decisions-log.md` §65).
- **An enabled switch that the backend ignores must be shown as ignored.** The
  recurring sweep drops Free-plan projects (`skipped_plan_ineligible`,
  `lib/scan/cron.ts`), so a Free project with the toggle on never scans.
  Counting it as active invents work, and any cost derived from it invents
  spend — it is counted separately and costs zero (§65).
- **Reads added to `/admin` go in their own query, and fail toward "unknown".**
  Migrations here are applied by hand, and a column PostgREST does not know
  fails the ENTIRE select — riding along in the main query turns a pending
  migration into a blank screen instead of one empty column. Same remedy
  `/debug` already uses for the audit halves. Unlike the scan path, this
  screen fails toward *no data*, never toward a value: on a read-only console
  a fabricated "disabled" is worse than a gap, because it looks like an answer
  (§65).
- **A cost figure travels with its provenance, always.** `lib/admin/cost-model.ts`
  copies the rates from `docs/llm-cost-analysis-2026-08.md` §7 and carries
  whether each is measured, estimated, or unmeasured; a total can never be
  presented as more reliable than its weakest part. If those rates change in
  the analysis, they change here — this file is a declared copy, not a second
  source of truth (§65).
- **Never cap a read by row count without saying so on screen.** Same
  principle as `.claude/rules/scan.md`'s "never cap the work by row count":
  `auth.admin.listUsers()`'s single-page fetch has a real ceiling
  (`AUTH_USERS_FETCH_CAP`), and hitting it must set `authUsersTruncated` and
  render a visible note — not silently show `lastSignInAt` as missing with no
  explanation.
