import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { getUsageSummary } from "@/lib/billing";
import { PlanBillingSection } from "@/components/billing/plan-billing-section";
import { ManageBillingButton } from "@/components/billing/manage-billing-button";
import { CheckoutSuccessPoller } from "@/components/billing/checkout-success-poller";

export async function BillingContent({
  embedded = false,
  checkoutStatus
}: {
  embedded?: boolean;
  /** BILLING-STRIPE-1: `?checkout=success|cancelled` from the Stripe Checkout redirect. */
  checkoutStatus?: string;
}) {
  const usage = await getUsageSummary();

  const sections = (
    <>
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

      <section className="space-y-2">
        <div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">Pago y facturas</h2>
          <p className="sub mt-1">Método de pago y tu historial de facturación.</p>
        </div>

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
      </section>
    </>
  );

  if (embedded) {
    return <div className="set-pane">{sections}</div>;
  }

  return (
    <div className="page space-y-6">
      <p className="kicker">Cuenta</p>
      <h1 className="title-lg">Plan y facturación</h1>
      {sections}
    </div>
  );
}
