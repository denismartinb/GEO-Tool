import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { getUsageSummary } from "@/lib/billing";
import { PlanBillingSection } from "@/components/billing/plan-billing-section";
import { ManageBillingButton } from "@/components/billing/manage-billing-button";
import { CheckoutSuccessPoller } from "@/components/billing/checkout-success-poller";
import { BillingDetailsForm } from "@/components/settings/billing-details";
import type { BillingDetails } from "@/lib/settings/company-details";

/**
 * CONSOLE-REDESIGN-1: this is the "Plan" section of the single settings page.
 *
 * The `embedded` prop and the standalone-page branch are gone — /dashboard/
 * settings/billing is now a redirect, so this component has exactly one caller
 * and the alternative layout was unreachable code carrying its own heading.
 */
export async function BillingContent({
  checkoutStatus,
  billingDetails
}: {
  /** BILLING-STRIPE-1: `?checkout=success|cancelled` from the Stripe Checkout redirect. */
  checkoutStatus?: string;
  billingDetails: BillingDetails;
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
        <CardContent className="space-y-3 py-6 text-center">
          <Icon name="card" size={22} className="mx-auto text-[var(--ink-3)]" />
          {usage.hasStripeCustomer ? (
            <>
              <p className="sub">Actualiza tu método de pago o consulta tu historial de facturas en Stripe.</p>
              <ManageBillingButton />
            </>
          ) : (
            <p className="sub">Todavía no tienes ningún plan de pago activo.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <BillingDetailsForm initial={billingDetails} />
        </CardContent>
      </Card>
    </div>
  );
}
