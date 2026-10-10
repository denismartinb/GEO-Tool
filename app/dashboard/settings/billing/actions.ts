"use server";

import { z } from "zod";
import type Stripe from "stripe";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { PLANS } from "@/app/pricing/plans-data";
import { captureFunnelEvent } from "@/lib/analytics/funnel-events";
import {
  getActivePromoPlanIds,
  getStripeClient,
  getPriceIdForPlan,
  getPromoCouponIdForPlan,
  invalidateFounderOfferCache,
  isSelfServePlan,
  stripePriceMatchesPlan,
  type SelfServePlanId
} from "@/lib/stripe";

const planIdSchema = z.enum(PLANS.map((plan) => plan.id) as [string, ...string[]]);
const archiveIdsSchema = z.array(z.string().uuid()).max(50);

/**
 * Derived from the actual incoming request rather than NEXT_PUBLIC_SITE_URL:
 * that env var is set to the production domain, which is correct for real
 * usage but silently sends a Preview-deployment redirect back to
 * production's login (a different origin, no session) once Stripe redirects
 * — found via live testing. Vercel's branch-alias domains (geo-tool-git-*)
 * proxy the request and rewrite `host` to the underlying deployment's own
 * host, exposing the original public domain only via `x-forwarded-host` —
 * found via a second round of live testing. Trailing slash is stripped in
 * case the env var fallback itself has one (it does, in this project's
 * Vercel config).
 */
async function getRequestSiteUrl(): Promise<string> {
  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const protocol = headersList.get("x-forwarded-proto") ?? "https";
  const fallbackSiteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return (host ? `${protocol}://${host}` : fallbackSiteUrl).replace(/\/+$/, "");
}

export type ChangePlanResult = { success: true } | { success: false; error: string };

const CHANGE_PLAN_GENERIC_ERROR = "No se pudo guardar el cambio de plan. Inténtalo de nuevo.";

type CancelSubscriptionResult = { ok: true } | { ok: false; error: string };

/**
 * Step 1 of a downgrade: stop the recurring charge in Stripe. Touches Stripe
 * only — never the profile row — so "cancel the billing" and "change the
 * entitlements" are two separate steps with two separate failure modes
 * (SEC-CHANGEPLAN-1). Fails closed: no Stripe client, a Stripe error, or an
 * answer that is not a cancelled subscription all return `ok: false`, and the
 * caller leaves the database untouched. The old code skipped the cancellation
 * when no client was configured and then NULLed `stripe_subscription_id`,
 * orphaning a live subscription that kept billing with no trace in our data.
 */
async function cancelStripeSubscription(subscriptionId: string, userId: string): Promise<CancelSubscriptionResult> {
  const stripe = getStripeClient();
  if (!stripe) {
    console.error("[geo:billing] cannot cancel subscription: Stripe client unavailable", { userId, subscriptionId });
    return { ok: false, error: "La facturación no está disponible ahora mismo. No hemos cambiado tu plan; inténtalo más tarde." };
  }

  try {
    const cancelled = await stripe.subscriptions.cancel(subscriptionId);
    if (cancelled?.status !== "canceled") {
      console.error("[geo:billing] Stripe did not confirm the cancellation", { userId, subscriptionId, status: cancelled?.status });
      return { ok: false, error: "No se pudo cancelar la suscripción activa. Inténtalo de nuevo." };
    }
    return { ok: true };
  } catch (stripeError) {
    console.error("[geo:billing] failed to cancel Stripe subscription on downgrade", {
      userId,
      subscriptionId,
      message: stripeError instanceof Error ? stripeError.message : String(stripeError)
    });
    return { ok: false, error: "No se pudo cancelar la suscripción activa. Inténtalo de nuevo." };
  }
}

/**
 * Step 2 of a downgrade: take the paid entitlements away. Privileged write
 * (0016_protect_billing_columns.sql rejects it from anything but the service
 * role), so it is also the last line of defence: it is scoped to the exact
 * subscription we just cancelled (or to "no subscription" when there was none)
 * and must touch exactly one row. If the profile moved on in the meantime — a
 * newer subscription linked by a webhook — nothing is overwritten.
 */
async function revokePaidEntitlements(userId: string, cancelledSubscriptionId: string | null): Promise<boolean> {
  let serviceClient: ReturnType<typeof createServiceClient>;
  try {
    serviceClient = createServiceClient();
  } catch (configError) {
    console.error("[geo:billing] service client unavailable for changePlan", {
      userId,
      message: configError instanceof Error ? configError.message : String(configError)
    });
    return false;
  }

  const base = serviceClient
    .from("profiles")
    .update({ current_plan: "free", stripe_subscription_id: null, cancel_at: null })
    .eq("id", userId);
  const guarded = cancelledSubscriptionId
    ? base.eq("stripe_subscription_id", cancelledSubscriptionId)
    : base.is("stripe_subscription_id", null);
  const { data, error } = await guarded.select("id");

  if (error) {
    console.error("[geo:billing] failed to revoke entitlements", { userId, message: error.message });
    return false;
  }
  if (!data || data.length !== 1) {
    console.error("[geo:billing] entitlement revoke matched no row (profile changed concurrently)", {
      userId,
      cancelledSubscriptionId
    });
    return false;
  }
  return true;
}

/**
 * Self-serve plan change — SERVER-SIDE PAYMENT GATE (SEC-CHANGEPLAN-1).
 *
 * This action can only ever LOWER what an account is entitled to; it can
 * never grant a paid plan. Paid plans are contracted exclusively through
 * Stripe Checkout (`createCheckoutSession`) or the Customer Portal, and the
 * entitlement only changes when the webhook confirms a real subscription. The
 * rule used to live in the client (`change-plan-modal` routed Free -> paid to
 * Checkout) while this action wrote `current_plan` with the service role for
 * any valid plan id — so a Free user calling it directly got Agency for free.
 *
 * Accepted targets, decided from the account's state read on the server:
 *  - `free`: downgrade. Cancels the real subscription first (if any), then
 *    revokes the entitlements. Fails closed at every step.
 *  - the plan the account already has: archive-only (the domain-overage flow
 *    re-submits the current plan with the domains to archive). Never writes
 *    the plan.
 *  - anything else: rejected, before anything is archived.
 *
 * If `archiveProjectIds` is given, those domains are archived — never
 * hard-deleted, reversible via restoreProject — before the plan itself
 * changes, so an account is never left over its new plan's domain cap. If
 * archiving succeeds but a later step fails, the domains stay archived
 * (reversible) and the plan stays as it was; the user can just retry.
 */
export async function changePlan(planId: string, archiveProjectIds: string[] = []): Promise<ChangePlanResult> {
  const parsedPlan = planIdSchema.safeParse(planId);
  if (!parsedPlan.success) {
    return { success: false, error: "Plan no válido." };
  }

  const parsedArchiveIds = archiveIdsSchema.safeParse(archiveProjectIds);
  if (!parsedArchiveIds.success) {
    return { success: false, error: CHANGE_PLAN_GENERIC_ERROR };
  }

  const { supabase, user } = await requireUser();
  const targetPlan = PLANS.find((p) => p.id === parsedPlan.data)!;

  // The account's own billing state, read on the server. Nothing the client
  // sent about its current plan is trusted.
  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select("current_plan, stripe_subscription_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profileRow) {
    return { success: false, error: CHANGE_PLAN_GENERIC_ERROR };
  }

  const currentPlanId = profileRow.current_plan as string | null | undefined;
  const subscriptionId = (profileRow.stripe_subscription_id as string | null | undefined) ?? null;
  const isArchiveOnly = targetPlan.id === currentPlanId;
  const isDowngradeToFree = !isArchiveOnly && targetPlan.id === "free";

  if (!isArchiveOnly && !isDowngradeToFree) {
    return {
      success: false,
      error: "Los planes de pago se contratan desde el pago seguro de Stripe, no desde aquí."
    };
  }

  if (parsedArchiveIds.data.length > 0) {
    const { error: archiveError, count: archivedCount } = await supabase
      .from("projects")
      .update({ is_archived: true }, { count: "exact" })
      .in("id", parsedArchiveIds.data)
      .eq("owner_user_id", user.id)
      .eq("is_archived", false);

    if (archiveError || archivedCount !== parsedArchiveIds.data.length) {
      return { success: false, error: "No se pudieron archivar los dominios seleccionados. Inténtalo de nuevo." };
    }

    revalidatePath("/dashboard", "layout");
    revalidatePath("/dashboard/projects");
  }

  // Defense in depth: re-check server-side that the account is actually
  // within the target plan's domain cap now, regardless of what the client
  // sent — never trust the UI's own count.
  const { count: activeProjectCount, error: countError } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", user.id)
    .eq("is_archived", false);

  if (countError || (activeProjectCount ?? 0) > targetPlan.caps.projects) {
    return {
      success: false,
      error: `Todavía tienes más dominios activos de los que permite ${targetPlan.name}. Archiva alguno más para continuar.`
    };
  }

  if (isArchiveOnly) {
    return { success: true };
  }

  // Downgrade: cancel the real charge first, then take the entitlements away.
  // Cancelling and changing entitlements are separate steps (SEC-CHANGEPLAN-1).
  if (subscriptionId) {
    const cancelled = await cancelStripeSubscription(subscriptionId, user.id);
    if (!cancelled.ok) {
      return { success: false, error: cancelled.error };
    }
  }

  const revoked = await revokePaidEntitlements(user.id, subscriptionId);
  if (!revoked) {
    return {
      success: false,
      error: subscriptionId
        ? "Hemos cancelado tu suscripción, pero no hemos podido actualizar tu plan todavía. Se actualizará en unos minutos; si no, escríbenos a soporte@genscore.es."
        : CHANGE_PLAN_GENERIC_ERROR
    };
  }

  revalidatePath("/dashboard/settings/billing");
  revalidatePath("/dashboard/billing");
  return { success: true };
}

export type CheckoutSessionResult = { success: true; url: string } | { success: false; error: string };

/**
 * Creates a real Stripe Checkout Session for a first-time paid subscription
 * (Free -> Starter/Pro). Deliberately NOT used for switching between two
 * already-paid plans (Starter <-> Pro): that would create a second parallel
 * Stripe subscription for the same customer instead of modifying the
 * existing one, double-billing them. That transition is disabled in the UI
 * (change-plan-modal) until PR 2's Customer Portal, which handles a
 * prorated in-place subscription update correctly.
 */
export async function createCheckoutSession(planId: string): Promise<CheckoutSessionResult> {
  if (!isSelfServePlan(planId)) {
    return { success: false, error: "Este plan no se contrata online. Escríbenos a soporte@genscore.es." };
  }

  const stripe = getStripeClient();
  const priceId = getPriceIdForPlan(planId);
  if (!stripe || !priceId) {
    return { success: false, error: "La facturación todavía no está disponible. Vuelve a intentarlo más tarde." };
  }

  const { supabase, user } = await requireUser();
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("stripe_customer_id, stripe_subscription_id")
    .eq("id", user.id)
    .maybeSingle();

  // Checked against stripe_subscription_id (a real subscription), not
  // current_plan — a reverse-trial account already has current_plan="pro"
  // with nothing real behind it yet, and must still be able to check out
  // (BILLING-STRIPE-1 PR 3). Only an existing real subscription would make a
  // second Checkout create a duplicate, parallel one.
  if (profileRow?.stripe_subscription_id) {
    return {
      success: false,
      error: "Ya tienes un plan de pago activo. Escríbenos a soporte@genscore.es para cambiarlo."
    };
  }

  const siteUrl = await getRequestSiteUrl();
  const existingCustomerId = profileRow?.stripe_customer_id as string | null | undefined;

  // FOUNDER-PRICE-1: the Stripe Price behind the env var must charge exactly
  // what PLANS shows. A deploy that ships new prices before the env points at
  // the matching Price would otherwise show one amount and charge another.
  try {
    if (!(await stripePriceMatchesPlan(stripe, priceId, planId))) {
      console.error("[geo:billing] Stripe price does not match the catalog, refusing checkout", { planId, priceId });
      return { success: false, error: "La facturación todavía no está disponible. Vuelve a intentarlo más tarde." };
    }
  } catch (priceError) {
    console.error("[geo:billing] failed to verify Stripe price against the catalog", {
      planId,
      message: priceError instanceof Error ? priceError.message : String(priceError)
    });
    return { success: false, error: "No se pudo iniciar el pago. Inténtalo de nuevo." };
  }

  // FOUNDER-PRICE-1: the founder coupon only when getActivePromoPlanIds says
  // so — the same source /precios, the console and the emails read, so the
  // shown price and the charged price cannot drift apart.
  const promoCouponId = (await getActivePromoPlanIds()).includes(planId) ? getPromoCouponIdForPlan(planId) : null;

  // Arrow function expressions (not hoisted `function` declarations) so
  // TypeScript retains the `priceId` non-null narrowing from the early
  // return above — a hoisted declaration is conservative about closures.
  const buildSessionParams = (customerId: string | null | undefined): Stripe.Checkout.SessionCreateParams => ({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    ...(promoCouponId ? { discounts: [{ coupon: promoCouponId }] } : {}),
    client_reference_id: user.id,
    customer: customerId ?? undefined,
    customer_email: customerId ? undefined : (user.email ?? undefined),
    billing_address_collection: "required",
    automatic_tax: { enabled: true },
    subscription_data: { metadata: { user_id: user.id, plan_id: planId } },
    metadata: { user_id: user.id, plan_id: planId },
    // CHECKOUT-RETURN-1 (log §255): straight to the page that reads
    // `?checkout=`, not through /dashboard/settings/billing — that route's
    // redirect drops the query, so the success notice, the plan poller and the
    // purchase conversion never ran after a real payment.
    success_url: `${siteUrl}/dashboard/settings?checkout=success#plan`,
    cancel_url: `${siteUrl}/dashboard/settings?checkout=cancelled#plan`
  });

  const isMissingCustomerError = (error: unknown): boolean => {
    const stripeErr = error as { code?: string; param?: string } | null;
    return stripeErr?.code === "resource_missing" && stripeErr?.param === "customer";
  };

  try {
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create(buildSessionParams(existingCustomerId));
    } catch (firstError) {
      // A stored stripe_customer_id can go stale (Stripe test-data reset,
      // manual deletion in the dashboard) independently of anything this app
      // does — found live when a real profile's customer id no longer
      // existed in Stripe, hard-failing checkout for that user with no
      // recovery. Retry once, letting Stripe create a fresh customer from
      // customer_email instead; the webhook's checkout.session.completed
      // handler already overwrites stripe_customer_id unconditionally on
      // success, so this self-heals the stale value without a separate write.
      if (!existingCustomerId || !isMissingCustomerError(firstError)) throw firstError;

      console.warn("[geo:billing] stale stripe_customer_id, retrying checkout without it", {
        userId: user.id,
        planId
      });
      session = await stripe.checkout.sessions.create(buildSessionParams(null));
    }

    if (!session.url) {
      return { success: false, error: "No se pudo iniciar el pago. Inténtalo de nuevo." };
    }

    await captureFunnelEvent("checkout_started", user.id, { plan_id: planId });
    return { success: true, url: session.url };
  } catch (stripeError) {
    // A founder coupon that ran out of slots between the cached read and
    // this call fails the session; the next attempt must re-read Stripe.
    if (promoCouponId) invalidateFounderOfferCache();
    console.error("[geo:billing] failed to create Stripe checkout session", {
      userId: user.id,
      planId,
      message: stripeError instanceof Error ? stripeError.message : String(stripeError)
    });
    return { success: false, error: "No se pudo iniciar el pago. Inténtalo de nuevo." };
  }
}

export type PortalSessionResult = { success: true; url: string } | { success: false; error: string };

/** Deep-links straight into a specific Portal screen instead of its homepage — see `createPortalSession`. */
export type PortalIntent = { type: "update"; planId: SelfServePlanId } | { type: "cancel" };

/**
 * Opens a real Stripe Customer Portal session for the caller's own
 * subscription — payment method, invoice history, cancellation, and (once
 * configured in the Stripe Dashboard) switching between Starter/Pro. Portal
 * changes are picked up by the existing webhook (`customer.subscription.*`),
 * same as a Checkout-created subscription.
 *
 * `intent` deep-links straight into the Portal's "confirm this plan" or
 * "cancel" screen (Stripe's `flow_data`) instead of landing on the Portal
 * homepage and making the customer click through to it themselves — found
 * to be worth doing via live testing, where the extra click read as the
 * feature being half-built. Falls back to the plain portal homepage (still
 * useful, just not deep-linked) if the subscription/item lookup needed to
 * build the deep link fails for any reason; this is a convenience, never a
 * reason to block opening the portal at all.
 *
 * Deliberately does not auto-archive projects if a Portal-driven downgrade
 * leaves the account over its new plan's domain cap: the founder wants the
 * owner to choose which domains to keep, not have the system pick for them.
 * `PlanBillingSection` detects that overage from the same usage numbers
 * already shown on the page and prompts the owner to resolve it themselves
 * (`ChangePlanModal`'s `overageOnly` mode), the same archive picker already
 * used for an in-app downgrade.
 */
export async function createPortalSession(intent?: PortalIntent): Promise<PortalSessionResult> {
  const stripe = getStripeClient();
  if (!stripe) {
    return { success: false, error: "La facturación todavía no está disponible. Vuelve a intentarlo más tarde." };
  }

  const { supabase, user } = await requireUser();
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("stripe_customer_id, stripe_subscription_id")
    .eq("id", user.id)
    .maybeSingle();

  const customerId = profileRow?.stripe_customer_id as string | null | undefined;
  if (!customerId) {
    return { success: false, error: "Todavía no tienes ninguna suscripción de pago que gestionar." };
  }

  const siteUrl = await getRequestSiteUrl();
  const returnUrl = `${siteUrl}/dashboard/settings/billing`;
  const subscriptionId = profileRow?.stripe_subscription_id as string | null | undefined;
  const flowData = subscriptionId ? await buildPortalFlowData(stripe, intent, subscriptionId, returnUrl) : undefined;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
      ...(flowData ? { flow_data: flowData } : {})
    });

    return { success: true, url: session.url };
  } catch (stripeError) {
    console.error("[geo:billing] failed to create Stripe billing portal session", {
      userId: user.id,
      message: stripeError instanceof Error ? stripeError.message : String(stripeError)
    });
    return { success: false, error: "No se pudo abrir el portal de facturación. Inténtalo de nuevo." };
  }
}

async function buildPortalFlowData(
  stripe: NonNullable<ReturnType<typeof getStripeClient>>,
  intent: PortalIntent | undefined,
  subscriptionId: string,
  returnUrl: string
): Promise<Stripe.BillingPortal.SessionCreateParams.FlowData | undefined> {
  if (!intent) return undefined;

  if (intent.type === "cancel") {
    return { type: "subscription_cancel", subscription_cancel: { subscription: subscriptionId } };
  }

  const priceId = getPriceIdForPlan(intent.planId);
  if (!priceId) return undefined;

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const itemId = subscription.items.data[0]?.id;
    if (!itemId) return undefined;

    return {
      type: "subscription_update_confirm",
      subscription_update_confirm: {
        subscription: subscriptionId,
        items: [{ id: itemId, price: priceId, quantity: 1 }]
      },
      after_completion: { type: "redirect", redirect: { return_url: `${returnUrl}?checkout=success` } }
    };
  } catch (stripeError) {
    console.error("[geo:billing] failed to look up subscription for a Portal deep link, falling back to homepage", {
      subscriptionId,
      message: stripeError instanceof Error ? stripeError.message : String(stripeError)
    });
    return undefined;
  }
}
