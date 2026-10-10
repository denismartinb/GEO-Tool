import "server-only";

import type Stripe from "stripe";
import type { createServiceClient } from "@/lib/supabase/service";
import { captureFunnelEvent } from "@/lib/analytics/funnel-events";
import { getPlanIdForPriceId } from "@/lib/stripe";
import { PLANS } from "@/app/pricing/plans-data";
import { sendCancellationScheduledEmail, sendPaymentFailedEmail, sendPlanConfirmedEmail } from "@/lib/email/transactional";

const ENDED_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  "canceled",
  "unpaid",
  "incomplete_expired",
  "paused"
]);

export type WebhookOutcome = "applied" | "ignored";

export type WebhookApplyResult = {
  outcome: WebhookOutcome;
  /**
   * Side effects that must happen AT MOST ONCE per Stripe event (emails). They
   * are returned instead of run so the registry can mark the event processed
   * first: a Stripe retry of a processed event then re-sends nothing, and a
   * failed email never turns into a 500 that replays the (already committed)
   * database write.
   */
  afterCommit: Array<() => Promise<unknown>>;
};

type Service = ReturnType<typeof createServiceClient>;

const IGNORED: WebhookApplyResult = { outcome: "ignored", afterCommit: [] };

/**
 * The subscription an event is about — the key for per-subscription ordering
 * (webhook-registry.ts). `null` for events that don't carry one.
 */
export function getEventSubjectId(event: Stripe.Event): string | null {
  const object = event.data.object as unknown as Record<string, unknown>;
  switch (event.type) {
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return typeof object.id === "string" ? object.id : null;
    case "checkout.session.completed": {
      const subscription = object.subscription;
      if (typeof subscription === "string") return subscription;
      return typeof (subscription as { id?: unknown } | null)?.id === "string"
        ? ((subscription as { id: string }).id)
        : null;
    }
    default:
      return null;
  }
}

/**
 * Applies the DATABASE side of a Stripe event and returns the emails to send
 * once it is committed. Kept separate from the route
 * (app/api/webhooks/stripe/route.ts) and from the registry so it is
 * unit-testable without an HTTP request or a Stripe signature.
 *
 * Every write is scoped to the exact subscription the event is about
 * (SEC-WEBHOOK-REGISTRY-1): an event for a subscription the profile no longer
 * points at — an old one cancelled by a downgrade, a replayed delete — cannot
 * touch the plan of whatever the account has now. Only `checkout.session
 * .completed` (the signed result of a payment we initiated) links a
 * subscription to a profile.
 */
export async function applyStripeWebhookEvent(event: Stripe.Event, service: Service): Promise<WebhookApplyResult> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;
      const planId = session.metadata?.plan_id;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

      if (!userId || !planId || !customerId || !subscriptionId) {
        console.error("[geo:billing:webhook] checkout.session.completed missing required fields", {
          eventId: event.id,
          hasUserId: Boolean(userId),
          hasPlanId: Boolean(planId),
          hasCustomerId: Boolean(customerId),
          hasSubscriptionId: Boolean(subscriptionId)
        });
        return IGNORED;
      }

      // Entitlements follow money, not a completed form: only a session Stripe
      // reports as paid (or needing no payment, e.g. a 100% coupon) grants a
      // plan. A delayed method that is still `unpaid` waits for its own event.
      if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
        console.error("[geo:billing:webhook] checkout.session.completed not paid, not granting a plan", {
          eventId: event.id,
          paymentStatus: session.payment_status
        });
        return IGNORED;
      }

      // Stripe ids are [A-Za-z0-9_]; refuse anything else before it is
      // interpolated into a PostgREST filter expression.
      if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) {
        console.error("[geo:billing:webhook] checkout.session.completed with a malformed subscription id", { eventId: event.id });
        return IGNORED;
      }

      // Link this subscription only if the profile holds none, or already holds
      // this very one. An old checkout replayed or delayed after the account
      // moved on to a newer subscription must not overwrite it — the guard is
      // part of the UPDATE itself, so it can't race a concurrent link.
      const { data: linked, error } = await service
        .from("profiles")
        .update({
          current_plan: planId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          // A real subscription just started — clear any reverse trial
          // (BILLING-STRIPE-1 PR 3) so its banner/countdown disappears
          // immediately instead of lingering until the original trial date.
          trial_ends_at: null
        })
        .eq("id", userId)
        .or(`stripe_subscription_id.is.null,stripe_subscription_id.eq.${subscriptionId}`)
        .select("id");

      if (error) throw new Error(`profiles update failed: ${error.message}`);

      if (!linked || linked.length === 0) {
        // The account already holds a DIFFERENT subscription. If this one is
        // live in Stripe, it is billing a customer our data doesn't link to —
        // that needs a human, so it must be loud, not silent.
        // Read who holds the link now, so an operator (or a future
        // reconciliation job) has both sides of the conflict in one log line.
        const { data: holder } = await service
          .from("profiles")
          .select("stripe_subscription_id")
          .eq("id", userId)
          .maybeSingle();
        console.error("[geo:billing:webhook] ORPHAN_SUBSCRIPTION_CANDIDATE: checkout completed for a subscription the profile does not hold; profile left untouched", {
          eventId: event.id,
          userId,
          unlinkedSubscriptionId: subscriptionId,
          heldSubscriptionId: (holder?.stripe_subscription_id as string | null | undefined) ?? null
        });
        return IGNORED;
      }

      // FUNNEL-EVENTS-1: after the plan is durable, so the event never claims
      // a payment the product has not recorded. Keyed by the Stripe event id
      // so a retried webhook is the same PostHog event, not a second payment.
      await captureFunnelEvent(
        "payment_completed",
        userId,
        {
          plan_id: planId,
          amount_total_cents: session.amount_total ?? null,
          currency: session.currency ?? null,
          livemode: event.livemode
        },
        event.id
      );

      const email = session.customer_details?.email;
      const afterCommit: WebhookApplyResult["afterCommit"] = [];
      if (email) {
        const planName = PLANS.find((p) => p.id === planId)?.name ?? planId;
        afterCommit.push(() => sendPlanConfirmedEmail(email, planName));
      }
      return { outcome: "applied", afterCommit };
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.user_id;
      if (!userId) {
        console.error("[geo:billing:webhook] customer.subscription.updated missing user_id metadata", {
          eventId: event.id,
          subscriptionId: subscription.id
        });
        return IGNORED;
      }

      if (ENDED_SUBSCRIPTION_STATUSES.has(subscription.status)) {
        // Scoped to THIS subscription: a late "ended" for an old one must not
        // downgrade an account that has since moved to a newer one.
        const { data, error } = await service
          .from("profiles")
          .update({ current_plan: "free", stripe_subscription_id: null, cancel_at: null })
          .eq("id", userId)
          .eq("stripe_subscription_id", subscription.id)
          .select("id");
        if (error) throw new Error(`profiles update failed: ${error.message}`);
        return data && data.length > 0 ? { outcome: "applied", afterCommit: [] } : IGNORED;
      }

      if (subscription.status === "active" || subscription.status === "trialing") {
        const priceId = subscription.items.data[0]?.price.id;
        const planId = priceId ? getPlanIdForPriceId(priceId) : null;
        if (!planId) return IGNORED;

        const { data: profileRow } = await service
          .from("profiles")
          .select("current_plan, email, stripe_subscription_id")
          .eq("id", userId)
          .maybeSingle();

        // Only the subscription the profile currently points at may change its
        // plan. If the link is missing (checkout.session.completed not seen
        // yet, or a downgrade cleared it) or points elsewhere, this event is
        // about a subscription that is not the account's — granting a plan
        // from it is how a stale "active" would resurrect a cancelled plan.
        if (!profileRow || profileRow.stripe_subscription_id !== subscription.id) {
          console.error("[geo:billing:webhook] subscription.updated for a subscription the profile doesn't hold, ignored", {
            eventId: event.id,
            subscriptionId: subscription.id
          });
          return IGNORED;
        }

        // Mirrors Stripe's own cancel_at regardless of whether it's newly
        // set or being cleared (the owner reactivated) — the billing page
        // reads this to show a real "cancels on <date>" state instead of a
        // plain "active" one with no such information. Deliberately does NOT
        // additionally require cancel_at_period_end: true — found via live
        // testing that the Customer Portal's cancel flow sets cancel_at to
        // the period end timestamp directly without ever flipping
        // cancel_at_period_end, so requiring both silently dropped every
        // real Portal-driven cancellation.
        const cancelAt = subscription.cancel_at ? new Date(subscription.cancel_at * 1000).toISOString() : null;

        const { error } = await service
          .from("profiles")
          .update({ current_plan: planId, trial_ends_at: null, cancel_at: cancelAt })
          .eq("id", userId)
          .eq("stripe_subscription_id", subscription.id);
        if (error) throw new Error(`profiles update failed: ${error.message}`);

        const afterCommit: WebhookApplyResult["afterCommit"] = [];
        if (profileRow.email) {
          const email = profileRow.email as string;
          if (profileRow.current_plan && profileRow.current_plan !== planId) {
            const planName = PLANS.find((p) => p.id === planId)?.name ?? planId;
            afterCommit.push(() => sendPlanConfirmedEmail(email, planName));
          }
          if (cancelAt) {
            afterCommit.push(() => sendCancellationScheduledEmail(email, new Date(cancelAt)));
          }
        }
        return { outcome: "applied", afterCommit };
      }
      return IGNORED;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.user_id;
      if (!userId) return IGNORED;

      // Scoped to the deleted subscription: when a downgrade (or a replay)
      // delivers this after the account already holds a newer subscription,
      // nothing matches and the newer plan is left alone.
      const { data, error } = await service
        .from("profiles")
        .update({ current_plan: "free", stripe_subscription_id: null, cancel_at: null })
        .eq("id", userId)
        .eq("stripe_subscription_id", subscription.id)
        .select("id");
      if (error) throw new Error(`profiles update failed: ${error.message}`);
      return data && data.length > 0 ? { outcome: "applied", afterCommit: [] } : IGNORED;
    }

    // Purely a notification — no profile write. The plan itself only
    // changes once Stripe actually cancels the subscription after its own
    // retry schedule is exhausted (customer.subscription.updated fires that,
    // handled above), so this just warns the owner their card was declined.
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const email = invoice.customer_email;
      return email
        ? { outcome: "applied", afterCommit: [() => sendPaymentFailedEmail(email)] }
        : IGNORED;
    }

    default:
      return IGNORED;
  }
}

/**
 * Apply + send, with no registry. Kept for callers (and tests) that want the
 * old one-shot behaviour; the webhook route goes through
 * `processStripeWebhookEvent` instead, which is idempotent and ordered.
 */
export async function handleStripeWebhookEvent(event: Stripe.Event, service: Service): Promise<void> {
  const { afterCommit } = await applyStripeWebhookEvent(event, service);
  for (const effect of afterCommit) await effect();
}
