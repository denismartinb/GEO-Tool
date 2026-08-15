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
- **The only writes `/admin` may make are the ones with an approved Task
  Intake.** As of ADMIN-CONSOLE-2b that is: MFA enrollment, and the three
  automation toggles (`recurring_scans_enabled`, the two audit halves) via
  `lib/admin/automation-actions.ts`. Changing a plan, editing a project's
  other fields, touching billing, or anything else still needs its own Task
  Intake — CLAUDE.md's protocol applies in full here, same as any other
  auth/server-action surface. Do not add a mutating action as a drive-by, and
  do not extend an approved write's scope past what its intake covered
  (e.g. adding a new column to an existing toggle action) without a fresh one.
- **Every write from `/admin` needs an email to `OPS_ALERT_EMAIL`.** There is
  no audit-log table for this (no migration approved), so the email genuinely
  IS the record of the action — not a nice-to-have alert alongside one. A
  write action with no alert call is missing the only accountability this
  surface has (`docs/brand/design-decisions-log.md` §79). It records who, which
  account, which project, and what changed — **not why**: the required-reason
  field was removed in ADMIN-CONSOLE-UX-1, an explicit founder decision made
  aware of the trade-off (§80). Do not reintroduce a reason requirement as a
  drive-by "consistency" fix; the founder chose to drop it once already.
- **An operator-scoped write may never have a precondition weaker than the
  owner-scoped action it mirrors.** Import the shared check from
  `lib/projects/automation-toggles.ts` (or wherever the owner action's
  precondition lives) — never re-derive it. And check whether the toggle
  being enabled actually has an effect for that account's plan before
  writing: `/admin` already shipped one class of this bug twice
  (recurring scans on Free, §71; coverage audit below Pro, §79) — the pattern
  is checked once per toggle now, but a new toggle added later needs the same
  question asked of it explicitly, not assumed answered.
- **`listFactors().data.totp` holds ONLY verified factors — a half-finished
  enrolment lives in `data.all`.** `auth-js` filters on
  `status === 'verified'`. Looking for a pending factor in `.totp` finds
  nothing, ever, so the page re-`enroll()`s, hits
  `A factor with the friendly name "" ... already exists`, and locks the
  operator out of `/admin` permanently — with the "generate a new one" escape
  hatch invisible too, because it renders only when a pending factor was
  found. Read pending factors through `lib/admin/mfa-factors.ts`;
  `requireOperator()` reads `.totp` deliberately, because there the question
  really is "is one verified?" (`docs/brand/design-decisions-log.md` §72).
- **Never silence a type error here with a cast.** That bug shipped because
  TypeScript said `'"verified"' and '"unverified"' have no overlap` — it had
  the answer — and the fix was an `as` assertion instead of a question. In
  this directory a type error is a hypothesis to check, not noise to quiet
  (§72).
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
  all of them (caught by `qa` on PR #394 before merge, §71). A column that
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
  (`docs/brand/design-decisions-log.md` §71).
- **An enabled switch that the backend ignores must be shown as ignored.** The
  recurring sweep drops Free-plan projects (`skipped_plan_ineligible`,
  `lib/scan/cron.ts`), so a Free project with the toggle on never scans.
  Counting it as active invents work, and any cost derived from it invents
  spend — it is counted separately and costs zero (§71).
- **Reads added to `/admin` go in their own query, and fail toward "unknown".**
  Migrations here are applied by hand, and a column PostgREST does not know
  fails the ENTIRE select — riding along in the main query turns a pending
  migration into a blank screen instead of one empty column. Same remedy
  `/debug` already uses for the audit halves. Unlike the scan path, this
  screen fails toward *no data*, never toward a value: on a read-only console
  a fabricated "disabled" is worse than a gap, because it looks like an answer
  (§71).
- **A cost figure travels with its provenance, always.** `lib/admin/cost-model.ts`
  copies the rates from `docs/llm-cost-analysis-2026-08.md` §7 and carries
  whether each is measured, estimated, or unmeasured; a total can never be
  presented as more reliable than its weakest part. If those rates change in
  the analysis, they change here — this file is a declared copy, not a second
  source of truth (§71).
- **Never cap a read by row count without saying so on screen.** Same
  principle as `.claude/rules/scan.md`'s "never cap the work by row count":
  `auth.admin.listUsers()`'s single-page fetch has a real ceiling
  (`AUTH_USERS_FETCH_CAP`), and hitting it must set `authUsersTruncated` and
  render a visible note — not silently show `lastSignInAt` as missing with no
  explanation.
- **A read a Client Component calls directly still goes through
  `requireOperator()` inside the action, same as a write.** `/admin/users`
  has a Client Component (`users-table.tsx`, ADMIN-CONSOLE-UX-1) that calls
  `fetchOperatorUserDetail` (`lib/admin/user-detail-action.ts`) via
  `useTransition` instead of navigating — this exists specifically so
  selecting an account doesn't re-run the whole page server-side just to
  fetch one detail. It is still a `"use server"` action, and it still calls
  `requireOperator("/admin/users")` as its first line, for the same reason
  every other action here does: a server action is a callable endpoint
  independent of whatever called it, page or client component alike
  (`docs/brand/design-decisions-log.md` §80).
- **Presentation helpers shared between the server page and a Client
  Component must not import anything `server-only`.** `app/admin/users/
  shared.tsx` holds `UserDetailPanel` and friends precisely because they
  have to render from both `page.tsx` (server) and `users-table.tsx`
  (client) — importing `formatUsd`/`provenanceLabel` from
  `lib/admin/cost-model.ts` (which starts with `import "server-only"`
  because it also computes cost from internal rates) broke the client build
  the moment `shared.tsx` was imported by a `"use client"` file. Pure
  formatting with nothing sensitive in it lives in `lib/admin/
  cost-format.ts` instead, with no `server-only` guard; the actual rate
  constants and `estimateProjectMonthlyCost` stay behind the guard in
  `cost-model.ts` (§80). If a future admin screen needs the same split,
  this is the pattern — split the presentation-safe half out, don't remove
  the guard from the file that has real internal numbers in it.
