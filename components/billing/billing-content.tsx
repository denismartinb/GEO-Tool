import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { getUsageSummary } from "@/lib/billing";
import { PLANS } from "@/app/pricing/plans-data";
import { PlanBillingSection } from "@/components/billing/plan-billing-section";

const agencyPlan = PLANS.find((plan) => plan.id === "agency")!;

// Visual reference only — there is no real payment/invoicing backend yet.
// Faked per explicit founder instruction so the layout can be reviewed
// pixel-perfect ahead of real Stripe integration.
const FAKE_PAYMENT_METHOD = {
  brand: "Visa",
  last4: "4242",
  expiry: "04 / 2028",
  billingEmail: "denis@agenciaacme.com",
  legalName: "Agencia Acme S.L.",
  taxId: "ESB12345678"
};

const FAKE_INVOICES = [
  { number: "INV-2026-006", date: "1 jun 2026", amount: 179 },
  { number: "INV-2026-005", date: "1 may 2026", amount: 179 },
  { number: "INV-2026-004", date: "1 abr 2026", amount: 179 }
];

export async function BillingContent({ embedded = false }: { embedded?: boolean }) {
  const usage = await getUsageSummary();

  const sections = (
    <>
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
          Subir a {agencyPlan.name} desbloquea workspaces multi-cliente e informes white-label.
        </p>
      </div>

      <PlanBillingSection currentPlanId={usage.planId} agencyPlanId="agency" usage={usage} />

      <section className="space-y-2">
        <div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">Pago y facturas</h2>
          <p className="sub mt-1">
            Método de pago y tu historial de facturación. Datos de ejemplo — disponibles cuando activemos la
            facturación real.
          </p>
        </div>

        <Card>
          <CardHeader>
            <p className="sub">Método de pago</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Icon name="card" size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    {FAKE_PAYMENT_METHOD.brand} •••• {FAKE_PAYMENT_METHOD.last4}
                  </p>
                  <p className="sub">Caduca {FAKE_PAYMENT_METHOD.expiry}</p>
                </div>
              </div>
              <Button type="button" variant="outline">
                <Icon name="edit" size={13} />
                Editar
              </Button>
            </div>
            <div className="space-y-2 border-t border-[var(--line-soft)] pt-4 text-sm">
              <div className="flex items-center gap-2 text-[var(--ink-2)]">
                <Icon name="mail" size={14} />
                Email de facturación
                <span className="ml-auto font-medium text-[var(--ink)]">{FAKE_PAYMENT_METHOD.billingEmail}</span>
              </div>
              <div className="flex items-center gap-2 text-[var(--ink-2)]">
                <Icon name="fileText" size={14} />
                Datos fiscales
                <span className="ml-auto font-medium text-[var(--ink)]">
                  {FAKE_PAYMENT_METHOD.legalName} · {FAKE_PAYMENT_METHOD.taxId}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between gap-3">
            <p className="sub">Historial de facturas</p>
            <Button type="button" variant="outline">
              <Icon name="download" size={13} />
              Exportar todo
            </Button>
          </CardHeader>
          <CardContent className="divide-y divide-[var(--line-soft)]">
            {FAKE_INVOICES.map((invoice) => (
              <div key={invoice.number} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <Icon name="fileText" size={16} className="text-[var(--ink-3)]" />
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink)]">{invoice.number}</p>
                    <p className="sub">{invoice.date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums text-[var(--ink)]">
                    {invoice.amount.toFixed(2).replace(".", ",")}&nbsp;€
                  </span>
                  <span className="badge badge-pos">Pagada</span>
                  <Button type="button" variant="outline" aria-label={`Descargar factura ${invoice.number}`}>
                    <Icon name="download" size={13} />
                  </Button>
                </div>
              </div>
            ))}
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
