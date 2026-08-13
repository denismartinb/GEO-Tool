import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { getUsageSummary } from "@/lib/billing";
import { PlanBillingSection } from "@/components/billing/plan-billing-section";
import { CheckoutSuccessPoller } from "@/components/billing/checkout-success-poller";
import { SUPPORT_EMAIL } from "@/lib/support";

/**
 * CONSOLE-REDESIGN-1: this is the "Plan" section of the single settings page.
 *
 * The block at the foot used to describe the payment state in four different
 * ways depending on the plan, which is how it ended up telling an Agencia
 * customer they had no paid plan. It is now a plain support block (founder,
 * 2026-08-06) — always true, whatever the plan.
 *
 * The route to invoices and payment method did NOT disappear with it: the
 * Stripe portal button moved next to "Cambiar de plan" in the plan card, where
 * it is shown to any account with a Stripe customer.
 *
 * Razón social + NIF are not here either: they live as a fold in Cuenta, next
 * to «Datos de empresa».
 */
export async function BillingContent({
  checkoutStatus
}: {
  /** BILLING-STRIPE-1: `?checkout=success|cancelled` from the Stripe Checkout redirect. */
  checkoutStatus?: string;
}) {
  const usage = await getUsageSummary();

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
        <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
          <Icon name="mail" size={22} className="text-[var(--ink-3)]" />
          <p className="sub">
            ¿Tienes alguna incidencia o consulta? Escríbenos a{" "}
            <a className="font-semibold text-[var(--accent)]" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>{" "}
            y te respondemos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
