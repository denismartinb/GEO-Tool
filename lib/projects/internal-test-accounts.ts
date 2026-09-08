import "server-only";

/**
 * PROJECT-DEFAULTS-BY-ACCOUNT-1 (founder-approved 2026-08-25) — allow-list of
 * accounts that keep today's cheap/testing defaults (sampling, coverage and
 * technical audit OFF at creation) while every other account gets the real
 * defaults ON. Same "allow-list, not deny-list" shape as
 * `previewTestingDefaults` in `app/dashboard/projects/actions.ts`: written
 * the other way round, an unset/misspelled env var would silently hand the
 * expensive defaults to the founder's own test accounts rather than the
 * reverse — the direction that actually costs something here is the opposite
 * one, so it's the one guarded by requiring an explicit match.
 *
 * Deliberately keyed by email, not by `auth.users.id` like `ADMIN_USER_IDS`
 * (`docs/environment-contract.md`). That file gates real access control,
 * where a self-service email change must never be able to grant it — the
 * failure mode here is only "a test account gets the expensive defaults on
 * its next new project", cheap to notice and fix, not a security boundary.
 */
export function isInternalTestAccountEmail(email: string | null | undefined): boolean {
  if (!email) return false;

  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  const raw = process.env.INTERNAL_TEST_ACCOUNT_EMAILS ?? "";
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalized);
}
