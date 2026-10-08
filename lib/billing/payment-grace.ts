/**
 * Payment-failure grace — the pure transition (CONTRACT-99 B6, owner decision relayed
 * 2026-10-08: "tres días desde el primer pago fallido y después solo lectura hasta pagar").
 *
 * Pure and dependency-free so it is testable with no Stripe, no database and no clock; nothing
 * here is wired to a webhook, a column or a screen. Wiring needs (a) a place to keep the first
 * failure date (schema, a separate approval) and (b) the webhook of the security PR (#549),
 * which this branch is deliberately not stacked on.
 *
 * The two rules the owner set, and the one the code adds:
 *  - The 3 days run from the FIRST failed payment. Stripe retries the same invoice several
 *    times; each retry sends another failure event, and none of them may restart the clock.
 *  - After the 3 days the account is READ-ONLY until it pays: it keeps seeing its data, and it
 *    stops spending (see `READ_ONLY_BLOCKS`). Not a downgrade to Free, not a deletion.
 *  - Stripe delivers events out of order. A failure event older than the date already stored
 *    moves the date BACK to the earlier one (the earliest failure is the first failure), and a
 *    payment event older than the stored failure must not clear a failure that happened after it.
 */
export const PAYMENT_GRACE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AccessMode = "full" | "grace" | "read_only";

export type PaymentAccess = {
  mode: AccessMode;
  /** When the grace ends (ISO), or null when no payment has failed. */
  graceEndsAt: string | null;
  /** Whole days left in the grace, rounded up; 0 once it is over; null when there is no failure. */
  daysLeft: number | null;
};

/**
 * What the account may do right now.
 * `firstFailedAt` is the stored date of the first unpaid failure (ISO), or null.
 * At exactly `firstFailedAt + 3 days` the grace is OVER (read-only): the owner promised three
 * days, not three days and a bit.
 */
export function evaluatePaymentAccess(firstFailedAt: string | null, now: number): PaymentAccess {
  if (!firstFailedAt) return { mode: "full", graceEndsAt: null, daysLeft: null };

  const failedMs = Date.parse(firstFailedAt);
  if (!Number.isFinite(failedMs)) {
    // An unreadable date must not silently lock a paying customer, nor silently grant free time:
    // fail toward the account keeping access, and let the caller log the bad value.
    return { mode: "full", graceEndsAt: null, daysLeft: null };
  }

  const endsMs = failedMs + PAYMENT_GRACE_DAYS * DAY_MS;
  if (now < endsMs) {
    return { mode: "grace", graceEndsAt: new Date(endsMs).toISOString(), daysLeft: Math.ceil((endsMs - now) / DAY_MS) };
  }
  return { mode: "read_only", graceEndsAt: new Date(endsMs).toISOString(), daysLeft: 0 };
}

export type PaymentEvent =
  | { type: "failed"; createdMs: number }
  | { type: "paid"; createdMs: number };

/**
 * The next stored value of `firstFailedAt` after an event. Idempotent: applying the same event
 * twice gives the same answer, which is what makes webhook retries safe.
 */
export function nextFirstFailedAt(stored: string | null, event: PaymentEvent): string | null {
  if (event.type === "failed") {
    const incoming = new Date(event.createdMs).toISOString();
    if (!stored) return incoming;
    const storedMs = Date.parse(stored);
    if (!Number.isFinite(storedMs)) return incoming;
    // Keep the EARLIEST failure: a retry (later) never restarts the clock, and an out-of-order
    // older event correctly moves it back.
    return event.createdMs < storedMs ? incoming : stored;
  }

  // A payment clears the failure only if it happened AT OR AFTER it. A late-delivered older
  // payment must not wipe a failure that came after it.
  if (!stored) return null;
  const storedMs = Date.parse(stored);
  if (!Number.isFinite(storedMs)) return null;
  return event.createdMs >= storedMs ? null : stored;
}

/**
 * What "read-only" blocks — everything that SPENDS (LLM calls, fetches) or CHANGES the setup.
 * What stays: signing in, reading every screen and its history, exporting, opening the billing
 * page and the Stripe portal to pay. Listed here as data so the wiring (a later, separately
 * approved step) and its tests read the same list.
 */
export const READ_ONLY_BLOCKS = [
  "launch_scan",
  "scheduled_scan",
  "add_prompts",
  "generate_recommendation_rewrite",
  "run_audit",
  "create_domain",
  "change_competitors"
] as const;

export type ReadOnlyBlock = (typeof READ_ONLY_BLOCKS)[number];

export function isBlockedForAccess(mode: AccessMode, action: ReadOnlyBlock): boolean {
  return mode === "read_only" && (READ_ONLY_BLOCKS as readonly string[]).includes(action);
}
