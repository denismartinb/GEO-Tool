"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { PLANS } from "@/app/pricing/plans-data";
import { getStripeClient, getPriceIdForPlan, isSelfServePlan } from "@/lib/stripe";

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

/**
 * Changes the account's plan. If `archiveProjectIds` is given (downgrade
 * flow, when the account has more active domains than the target plan
 * allows), those domains are archived — never hard-deleted, reversible via
 * restoreProject — before the plan itself changes, so an account is never
 * left over its new plan's domain cap. If archiving succeeds but the plan
 * update then fails, the domains stay archived (reversible) and the plan
 * stays as it was; the user can just retry.
 */
export async function changePlan(planId: string, archiveProjectIds: string[] = []): Promise<ChangePlanResult> {
  const parsedPlan = planIdSchema.safeParse(planId);
  if (!parsedPlan.success) {
    return { success: false, error: "Plan no válido." };
  }

  const parsedArchiveIds = archiveIdsSchema.safeParse(archiveProjectIds);
  if (!parsedArchiveIds.success) {
    return { success: false, error: "No se pudo guardar el cambio de plan. Inténtalo de nuevo." };
  }

  const { supabase, user } = await requireUser();
  const targetPlan = PLANS.find((p) => p.id === parsedPlan.data)!;

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

  // BILLING-STRIPE-1: a self-serve immediate plan change (this action) only
  // ever targets a plan with no real Stripe price (today: only "free" — see
  // the change-plan-modal's paid<->paid guard, which routes any Free->paid
  // move through createCheckoutSession below instead). Cancel any real
  // subscription for real before flipping the DB column, so downgrading
  // actually stops the recurring charge rather than just relabeling the
  // account while Stripe keeps billing it.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("stripe_subscription_id")
    .eq("id", user.id)
    .maybeSingle();

  const subscriptionId = profileRow?.stripe_subscription_id as string | null | undefined;
  if (subscriptionId) {
    const stripe = getStripeClient();
    if (stripe) {
      try {
        await stripe.subscriptions.cancel(subscriptionId);
      } catch (stripeError) {
        console.error("[geo:billing] failed to cancel Stripe subscription on downgrade", {
          userId: user.id,
          subscriptionId,
          message: stripeError instanceof Error ? stripeError.message : String(stripeError)
        });
        return { success: false, error: "No se pudo cancelar la suscripción activa. Inténtalo de nuevo." };
      }
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({ current_plan: parsedPlan.data, stripe_subscription_id: null })
    .eq("id", user.id);

  if (error) {
    return { success: false, error: "No se pudo guardar el cambio de plan. Inténtalo de nuevo." };
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
    .select("stripe_customer_id, current_plan")
    .eq("id", user.id)
    .maybeSingle();

  if (profileRow?.current_plan && profileRow.current_plan !== "free") {
    return {
      success: false,
      error: "Ya tienes un plan de pago activo. Escríbenos a soporte@genscore.es para cambiarlo."
    };
  }

  const siteUrl = await getRequestSiteUrl();
  const existingCustomerId = profileRow?.stripe_customer_id as string | null | undefined;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      customer: existingCustomerId ?? undefined,
      customer_email: existingCustomerId ? undefined : (user.email ?? undefined),
      billing_address_collection: "required",
      automatic_tax: { enabled: true },
      subscription_data: { metadata: { user_id: user.id, plan_id: planId } },
      metadata: { user_id: user.id, plan_id: planId },
      success_url: `${siteUrl}/dashboard/settings/billing?checkout=success`,
      cancel_url: `${siteUrl}/dashboard/settings/billing?checkout=cancelled`
    });

    if (!session.url) {
      return { success: false, error: "No se pudo iniciar el pago. Inténtalo de nuevo." };
    }

    return { success: true, url: session.url };
  } catch (stripeError) {
    console.error("[geo:billing] failed to create Stripe checkout session", {
      userId: user.id,
      planId,
      message: stripeError instanceof Error ? stripeError.message : String(stripeError)
    });
    return { success: false, error: "No se pudo iniciar el pago. Inténtalo de nuevo." };
  }
}

export type PortalSessionResult = { success: true; url: string } | { success: false; error: string };

/**
 * Opens a real Stripe Customer Portal session for the caller's own
 * subscription — payment method, invoice history, cancellation, and (once
 * configured in the Stripe Dashboard) switching between Starter/Pro. Portal
 * changes are picked up by the existing webhook (`customer.subscription.*`),
 * same as a Checkout-created subscription.
 *
 * Deliberately does not auto-archive projects if a Portal-driven downgrade
 * leaves the account over its new plan's domain cap: the founder wants the
 * owner to choose which domains to keep, not have the system pick for them.
 * `PlanBillingSection` detects that overage from the same usage numbers
 * already shown on the page and prompts the owner to resolve it themselves
 * (`ChangePlanModal`'s `overageOnly` mode), the same archive picker already
 * used for an in-app downgrade.
 */
export async function createPortalSession(): Promise<PortalSessionResult> {
  const stripe = getStripeClient();
  if (!stripe) {
    return { success: false, error: "La facturación todavía no está disponible. Vuelve a intentarlo más tarde." };
  }

  const { supabase, user } = await requireUser();
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  const customerId = profileRow?.stripe_customer_id as string | null | undefined;
  if (!customerId) {
    return { success: false, error: "Todavía no tienes ninguna suscripción de pago que gestionar." };
  }

  const siteUrl = await getRequestSiteUrl();

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteUrl}/dashboard/settings/billing`
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
