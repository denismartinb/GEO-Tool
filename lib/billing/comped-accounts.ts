import "server-only";

/**
 * BILLING-COMPED-1 (Task Intake approved 2026-09-18) — allow-list of accounts
 * the product treats as always fully paid (Agency-tier caps + every
 * Pro-gated feature) without ever touching Stripe, test or live.
 *
 * Exists because a single Stripe secret key drives the whole app
 * (`getStripeClient()`, `lib/stripe.ts`): once `STRIPE_SECRET_KEY` switches
 * from `sk_test_...` to `sk_live_...`, every checkout charges for real —
 * there is no per-user routing to a second, test-mode Stripe client without
 * duplicating price IDs, webhook endpoints, and mixing real and fake
 * subscription data under the same `profiles.stripe_customer_id` column.
 * Comping an account is a read-time plan override, never a second Stripe
 * environment.
 *
 * Same "allow-list, not deny-list" shape as `isInternalTestAccountEmail`
 * (`lib/projects/internal-test-accounts.ts`): an unset/misspelled env var
 * must fail toward "pay like everyone else", never toward "free for nobody
 * expects". Keyed by email, not `auth.users.id` like `ADMIN_USER_IDS`
 * (`.claude/rules/admin.md`) — the failure mode here is "an account keeps
 * seeing a paywall it shouldn't", cheap to notice and fix, not a security
 * boundary.
 */
export function isCompedAccountEmail(email: string | null | undefined): boolean {
  if (!email) return false;

  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  const raw = process.env.COMPED_ACCOUNT_EMAILS ?? "";
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalized);
}
