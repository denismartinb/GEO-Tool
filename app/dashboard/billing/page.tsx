import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { getUsageSummary } from "@/lib/billing";
import { PLANS } from "@/app/pricing/plans-data";

const currentPlan = PLANS.find((plan) => plan.id === "pro")!;
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

function UsageRow({
  icon,
  label,
  value,
  cap
}: {
  icon: string;
  label: string;
  value: number;
  cap: number;
}) {
  const pct = cap > 0 ? Math.min(100, Math.round((value / cap) * 100)) : 0;
  const atCap = cap > 0 && value >= cap;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-[var(--ink-2)]">
          <Icon name={icon} size={15} />
          {label}
        </span>
        <span className="text-sm font-semibold tabular-nums text-[var(--ink)]">
          {value}/{cap}
        </span>
      </div>
      <div className="run-bar-wrap">
        <div className="run-bar">
          <div
            className="run-bar-fill"
            style={{ width: `${pct}%`, background: atCap ? "#f59e0b" : "var(--accent)" }}
          />
        </div>
      </div>
      {atCap && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-[#92600a]">
          <Icon name="alertCircle" size={13} />
          Cerca del límite del plan
        </p>
      )}
    </div>
  );
}

export default async function BillingPage() {
  const usage = await getUsageSummary();

  return (
    <div className="page space-y-6">
      <p className="kicker">Cuenta</p>
      <h1 className="title-lg">Plan y facturación</h1>

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

      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-[var(--ink)]">Tu plan</h2>
          <p className="sub">Facturación mensual</p>
        </div>
        <span className="badge badge-pos">
          <Icon name="check" size={11} />
          Activo
        </span>
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <p className="text-base font-semibold text-[var(--ink)]">{currentPlan.name}</p>
                <span className="badge badge-accent">Plan actual</span>
              </div>
              <p className="text-lg font-bold text-[var(--ink)]">
                {currentPlan.price}&nbsp;€/{currentPlan.period}
              </p>
            </div>
            <p className="sub mt-1">{currentPlan.tagline}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm text-[var(--ink-2)]">
              {currentPlan.highlights.map((highlight) => (
                <li key={highlight} className="flex items-start gap-2">
                  <Icon name="check" size={15} className="mt-0.5 shrink-0 text-[var(--pos)]" />
                  {highlight}
                </li>
              ))}
            </ul>
            <div className="flex gap-2 border-t border-[var(--line-soft)] pt-4">
              <Button type="button">
                <Icon name="arrUp" size={14} />
                Cambiar de plan
              </Button>
              <Button type="button" variant="outline">
                Cancelar suscripción
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--ink)]">Uso de este ciclo</h2>
        <Card>
          <CardContent className="space-y-4">
            <UsageRow icon="prompts" label="Prompts monitorizados" value={usage.promptCount} cap={usage.promptCap} />
            <UsageRow icon="globe" label="Proyectos / dominios" value={usage.projectCount} cap={usage.projectCap} />
            <UsageRow icon="layers" label="Motores de IA" value={usage.engineCount} cap={usage.engineCap} />
          </CardContent>
        </Card>

        <Card className="bg-[var(--surface-2)]">
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Icon name="fileText" size={16} className="text-[var(--accent)]" />
              <p className="font-semibold text-[var(--ink)]">
                ¿Gestionas varios clientes? El plan {agencyPlan.name} es para ti
              </p>
            </div>
            <p className="sub">
              Workspaces multi-cliente, ~300 prompts, todos los motores, informes white-label, alertas por email y
              Slack, y roles. Desde {agencyPlan.price}&nbsp;€/{agencyPlan.period}.
            </p>
            <Link href="/pricing">
              <Button type="button" className="w-full justify-center">
                Comparar planes
                <Icon name="arrRight" size={14} />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </section>

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
    </div>
  );
}
