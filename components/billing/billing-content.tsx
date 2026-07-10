import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { getUsageSummary } from "@/lib/billing";
import { PLANS } from "@/app/pricing/plans-data";
import { PlanBillingSection } from "@/components/billing/plan-billing-section";
import { ManageBillingButton } from "@/components/billing/manage-billing-button";

const agencyPlan = PLANS.find((plan) => plan.id === "agency")!;

export async function BillingContent({
  embedded = false,
  checkoutStatus
}: {
  embedded?: boolean;
  /** BILLING-STRIPE-1: `?checkout=success|cancelled` from the Stripe Checkout redirect. */
  checkoutStatus?: string;
}) {
  const usage = await getUsageSummary();
  const trialDaysLeft = usage.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(usage.trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null;

  const sections = (
    <>
      {trialDaysLeft !== null && (
        <p className="feedback">
          Estás probando <b>Pro</b> gratis — te quedan {trialDaysLeft} día{trialDaysLeft === 1 ? "" : "s"}. Contrata
          un plan para no perder el acceso cuando termine.
        </p>
      )}
      {checkoutStatus === "success" && (
        <p className="feedback success">
          Pago completado. Tu plan se está activando — si todavía no ves el cambio abajo, espera unos segundos y
          recarga la página.
        </p>
      )}
      {checkoutStatus === "cancelled" && (
        <p className="feedback">No se ha completado el pago. Tu plan no ha cambiado.</p>
      )}

      <div className="flex flex-col gap-3 rounded-[14px] border border-[var(--line)] bg-[var(--accent-soft)] p-4 sm:flex-row sm:items-center sm:gap-4">
        <div className="order-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-white text-[var(--accent)]">
          <Icon name="card" size={18} />
        </div>
        <Link href="/pricing" className="order-2 shrink-0 sm:order-3">
          <Button type="button" variant="outline" className="w-full justify-center sm:w-auto">
            <Icon name="grid" size={14} />
            Ver todos los planes
          </Button>
        </Link>
        <p className="order-3 text-sm text-[var(--accent-ink)] sm:order-2 sm:flex-1">
          Has usado <strong>{usage.promptCount} de {usage.promptCap}</strong> prompts incluidos en tu plan.
          Subir a {agencyPlan.name} amplía dominios y prompts a tu medida.
        </p>
      </div>

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
