import "server-only";

import type Stripe from "stripe";
import type { createServiceClient } from "@/lib/supabase/service";
import { getPlanIdForPriceId } from "@/lib/stripe";
import { PLANS } from "@/app/pricing/plans-data";
import { sendCancellationScheduledEmail, sendPaymentFailedEmail, sendPlanConfirmedEmail } from "@/lib/email/transactional";

const ENDED_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  "canceled",
  "unpaid",
  "incomplete_expired",
  "paused"
]);

/**
 * Pure event handler, kept separate from the route (app/api/webhooks/stripe/route.ts)
 * so it's unit-testable without a real HTTP request or Stripe signature.
 *
 * Every write here is naturally idempotent (setting the same columns to the
 * same values on a Stripe retry of an already-processed event is harmless),
 * so there's no separate "processed event ids" table — Stripe's own retry
 * schedule (2xx short-circuits it) is sufficient.
 */
export async function handleStripeWebhookEvent(
  event: Stripe.Event,
  service: ReturnType<typeof createServiceClient>
): Promise<void> {
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
        return;
      }

      const { error } = await service
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
        .eq("id", userId);

      if (error) throw new Error(`profiles update failed: ${error.message}`);

      const email = session.customer_details?.email;
      if (email) {
        const planName = PLANS.find((p) => p.id === planId)?.name ?? planId;
        await sendPlanConfirmedEmail(email, planName);
      }
      return;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.user_id;
      if (!userId) {
        console.error("[geo:billing:webhook] customer.subscription.updated missing user_id metadata", {
          eventId: event.id,
          subscriptionId: subscription.id
        });
        return;
      }

      if (ENDED_SUBSCRIPTION_STATUSES.has(subscription.status)) {
        const { error } = await service
          .from("profiles")
          .update({ current_plan: "free", stripe_subscription_id: null })
          .eq("id", userId);
        if (error) throw new Error(`profiles update failed: ${error.message}`);
        return;
      }

      if (subscription.status === "active" || subscription.status === "trialing") {
        const priceId = subscription.items.data[0]?.price.id;
        const planId = priceId ? getPlanIdForPriceId(priceId) : null;
        if (!planId) return;

        // Read before writing, purely to email-notify a real plan change —
        // this only fires for a genuine update to an already-existing
        // subscription (e.g. a Portal-driven Starter<->Pro switch), never
        // for the initial subscription a Checkout creates (that's a
        // customer.subscription.created event, which this handler doesn't
        // listen for at all — checkout.session.completed's own email covers
        // that case, so there's no double-send risk here).
        const { data: profileRow } = await service
          .from("profiles")
          .select("current_plan, email")
          .eq("id", userId)
          .maybeSingle();

        const { error } = await service
          .from("profiles")
          .update({ current_plan: planId, trial_ends_at: null })
          .eq("id", userId);
        if (error) throw new Error(`profiles update failed: ${error.message}`);

        if (profileRow?.email) {
          if (profileRow.current_plan && profileRow.current_plan !== planId) {
            const planName = PLANS.find((p) => p.id === planId)?.name ?? planId;
            await sendPlanConfirmedEmail(profileRow.email, planName);
          }
          if (subscription.cancel_at_period_end && subscription.cancel_at) {
            await sendCancellationScheduledEmail(profileRow.email, new Date(subscription.cancel_at * 1000));
          }
        }
      }
      return;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.user_id;
      if (!userId) return;

      const { error } = await service
        .from("profiles")
        .update({ current_plan: "free", stripe_subscription_id: null })
        .eq("id", userId);
      if (error) throw new Error(`profiles update failed: ${error.message}`);
      return;
    }

    // Purely a notification — no profile write. The plan itself only
    // changes once Stripe actually cancels the subscription after its own
    // retry schedule is exhausted (customer.subscription.updated fires that,
    // handled above), so this just warns the owner their card was declined.
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.customer_email) {
        await sendPaymentFailedEmail(invoice.customer_email);
      }
      return;
    }

    default:
      return;
  }
}
