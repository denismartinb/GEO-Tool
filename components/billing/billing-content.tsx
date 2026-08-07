import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { getUsageSummary } from "@/lib/billing";
import { PLANS } from "@/app/pricing/plans-data";
import { PlanBillingSection } from "@/components/billing/plan-billing-section";
import { ManageBillingButton } from "@/components/billing/manage-billing-button";
import { CheckoutSuccessPoller } from "@/components/billing/checkout-success-poller";

/**
 * CONSOLE-REDESIGN-1: this is the "Plan" section of the single settings page.
 *
 * The `embedded` prop and the standalone-page branch are gone — /dashboard/
 * settings/billing is now a redirect, so this component has exactly one caller
 * and the alternative layout was unreachable code carrying its own heading.
 *
 * Razón social + NIF are NOT here: they live as a fold in Cuenta, next to
 * «Datos de empresa» (founder, 2026-08-06).
 */
export async function BillingContent({
  checkoutStatus
}: {
  /** BILLING-STRIPE-1: `?checkout=success|cancelled` from the Stripe Checkout redirect. */
  checkoutStatus?: string;
}) {
  const usage = await getUsageSummary();
  const plan = PLANS.find((candidate) => candidate.id === usage.planId);

  /**
   * `hasStripeCustomer` means "has ever had a Stripe customer record", which is
   * NOT the same as "has no paid plan" — and the copy used to conflate them.
   * An Agencia account is a paying customer billed outside Stripe (the plan has
   * no self-serve price, PRICING-TRUTH-1), so it was being told "todavía no
   * tienes ningún plan de pago activo" while sitting on the top plan (founder,
   * 2026-08-06). Each state now says what is actually true of it.
   */
  const paymentState: "stripe" | "trialing" | "offline" | "none" = usage.hasStripeCustomer
    ? "stripe"
    : usage.trialEndsAt
      ? "trialing"
      : usage.planId !== "free"
        ? "offline"
        : "none";

  return (
    <div className="set-pane">
      {checkoutStatus === "success" && (
        <>
          <p className="feedback success">
            Pago completado. Tu plan se está activando — esto debería tardar solo unos segundos.
          </p>
          <CheckoutSuccessPoller pending={!usage.hasStripeSubscription} />
        </>
      )}
      {checkoutStatus === "cancelled" && (
        <p className="feedback">No se ha completado el pago. Tu plan no ha cambiado.</p>
      )}

      <PlanBillingSection
        currentPlanId={usage.planId}
        agencyPlanId="agency"
        usage={usage}
        activeProjects={usage.activeProjects}
      />

      <Card>
        <CardContent className="space-y-3 py-6 text-center">
          <Icon name="card" size={22} className="mx-auto text-[var(--ink-3)]" />
          {paymentState === "stripe" && (
            <>
              <p className="sub">Actualiza tu método de pago o consulta tu historial de facturas en Stripe.</p>
              <ManageBillingButton />
            </>
          )}
          {paymentState === "trialing" && (
            <p className="sub">Cuando contrates un plan, aquí verás tu método de pago y tus facturas.</p>
          )}
          {paymentState === "offline" && (
            <p className="sub">
              Tu plan <b>{plan?.name ?? usage.planId}</b> lo gestionamos contigo, no se cobra por Stripe.
              Para cualquier cambio, escríbenos a <b>soporte@genscore.es</b>.
            </p>
          )}
          {paymentState === "none" && <p className="sub">Todavía no tienes ningún plan de pago activo.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
