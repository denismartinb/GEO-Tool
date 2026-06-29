import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { InfoTip } from "@/components/ui/info-tip";
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
  { number: "INV-2026-006", date: "1 jun 2026", amount: "179,00 €" },
  { number: "INV-2026-005", date: "1 may 2026", amount: "179,00 €" },
  { number: "INV-2026-004", date: "1 abr 2026", amount: "179,00 €" },
  { number: "INV-2026-003", date: "1 mar 2026", amount: "45,00 €" }
];

function formatMadrid(date: Date) {
  return date.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Madrid"
  });
}

type UsageBarProps = {
  icon: string;
  label: string;
  /** Numeric usage row: current value out of `limit`. */
  used?: number;
  limit?: number;
  /** Non-metered row (e.g. "Diario", "Ilimitados") — full positive bar. */
  text?: string;
};

function UsageBar({ icon, label, used, limit, text }: UsageBarProps) {
  // Non-metered rows render a full positive bar with their textual value.
  if (text != null) {
    return (
      <div className="bill-usage">
        <div className="bill-usage-top">
          <span className="bill-usage-l">
            <Icon name={icon} size={14} />
            {label}
          </span>
          <span className="bill-usage-v">
            <b>{text}</b>
          </span>
        </div>
        <div className="bill-track">
          <div className="bill-fill" style={{ width: "100%", background: "var(--pos)" }} />
        </div>
      </div>
    );
  }

  const cap = limit ?? 0;
  const pct = cap > 0 ? Math.min(100, Math.round(((used ?? 0) / cap) * 100)) : 0;
  const near = pct >= 80;

  return (
    <div className="bill-usage">
      <div className="bill-usage-top">
        <span className="bill-usage-l">
          <Icon name={icon} size={14} />
          {label}
        </span>
        <span className="bill-usage-v tnum">
          <b>{used}</b>
          <span className="bill-usage-lim"> / {cap}</span>
        </span>
      </div>
      <div className="bill-track">
        <div
          className="bill-fill"
          style={{ width: `${pct}%`, background: near ? "var(--warn)" : "var(--accent)" }}
        />
      </div>
      {near && (
        <div className="bill-usage-hint">
          <Icon name="alertCircle" size={12} />
          Cerca del límite del plan
        </div>
      )}
    </div>
  );
}

export async function BillingContent({ embedded = false }: { embedded?: boolean }) {
  const usage = await getUsageSummary();

  // The billing cycle renews on the first day of each month. There is no
  // subscription record yet, so this is computed (not a frozen fake date).
  const now = new Date();
  const renewal = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const renewalLabel = formatMadrid(renewal);
  const daysUntilRenewal = Math.max(
    0,
    Math.ceil((renewal.getTime() - now.getTime()) / 86_400_000)
  );

  const sections = (
    <>
      {/* Resumen */}
      <div className="summary" style={{ alignItems: "center" }}>
        <div className="summary-ico">
          <Icon name="card" size={20} />
        </div>
        <div className="summary-txt" style={{ flex: 1 }}>
          Estás en el plan <b>{currentPlan.name}</b> · <b>{currentPlan.price}&nbsp;€/{currentPlan.period}</b>.
          Has usado <b>{usage.promptCount} de {usage.promptCap} prompts</b> este ciclo, que se renueva el{" "}
          <b>{renewalLabel}</b>. Subir a <b>{agencyPlan.name}</b> desbloquea workspaces multi-cliente e informes
          white-label.
        </div>
        <Link href="/pricing">
          <Button type="button" variant="outline">
            <Icon name="grid" size={15} />
            Ver todos los planes
          </Button>
        </Link>
      </div>

      {/* Plan actual + uso */}
      <div className="section-head">
        <div className="section-title">Tu plan</div>
        <div className="section-desc">Facturación mensual · próxima renovación {renewalLabel}</div>
        <div className="right">
          <span className="badge badge-pos">
            <Icon name="check" size={12} />
            Activo
          </span>
        </div>
      </div>

      <div className="bill-grid">
        {/* Tarjeta de plan */}
        <Card className="bill-plan">
          <div className="bill-plan-top">
            <div>
              <div className="bill-plan-name">
                {currentPlan.name}
                <span className="badge badge-accent">Plan actual</span>
              </div>
              <div className="bill-plan-tag">{currentPlan.tagline}</div>
            </div>
            <div className="bill-plan-price">
              <span className="tnum">{currentPlan.price}&nbsp;€</span>
              <span className="per">/{currentPlan.period}</span>
            </div>
          </div>
          <ul className="bill-plan-feats">
            {currentPlan.highlights.map((highlight) => (
              <li key={highlight}>
                <span className="pr-chk">
                  <Icon name="check" size={11} />
                </span>
                {highlight}
              </li>
            ))}
          </ul>
          <div className="bill-plan-actions">
            <Link href="/pricing">
              <Button type="button">
                <Icon name="arrUp" size={15} />
                Cambiar de plan
              </Button>
            </Link>
            <Button type="button" variant="outline">
              Cancelar suscripción
            </Button>
          </div>
        </Card>

        {/* Uso del ciclo */}
        <Card>
          <CardHeader className="flex items-center gap-2.5">
            <span className="card-title">Uso de este ciclo</span>
            <InfoTip text="Tu plan se mide por prompts × motores × frecuencia de refresco. Los usuarios son ilimitados y no cuentan para la factura." />
            <span className="ml-auto badge badge-neutral">
              <Icon name="clock" size={12} />
              Renueva en {daysUntilRenewal} {daysUntilRenewal === 1 ? "día" : "días"}
            </span>
          </CardHeader>
          <CardContent>
            <UsageBar icon="prompts" label="Prompts monitorizados" used={usage.promptCount} limit={usage.promptCap} />
            <UsageBar icon="globe" label="Proyectos / dominios" used={usage.projectCount} limit={usage.projectCap} />
            <UsageBar icon="layers" label="Motores de IA" used={usage.engineCount} limit={usage.engineCap} />
            <UsageBar icon="refresh" label="Frecuencia de refresco" text="Diario" />
            <div className="[&_.bill-usage]:!mb-0">
              <UsageBar icon="users" label="Usuarios del equipo" text="Ilimitados" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upsell a Agencia */}
      <div className="bill-upsell">
        <div className="bill-upsell-ic">
          <Icon name="building" size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="bill-upsell-t">¿Gestionas varios clientes? El plan {agencyPlan.name} es para ti</div>
          <div className="bill-upsell-d">
            Workspaces multi-cliente, ~300 prompts, todos los motores, informes white-label, alertas por email y
            Slack, y roles. Desde <b>{agencyPlan.price}&nbsp;€/{agencyPlan.period}</b>.
          </div>
        </div>
        <Link href="/pricing">
          <Button type="button">
            Comparar planes
            <Icon name="arrRight" size={15} />
          </Button>
        </Link>
      </div>

      {/* Método de pago + facturas */}
      <div className="section-head">
        <div className="section-title">Pago y facturas</div>
        <div className="section-desc">
          Método de pago y tu historial de facturación. Datos de ejemplo — disponibles cuando activemos la
          facturación real.
        </div>
      </div>

      <div className="bill-grid">
        {/* Método de pago */}
        <Card>
          <CardHeader>
            <span className="card-title">Método de pago</span>
          </CardHeader>
          <CardContent>
            <div className="bill-pay">
              <div className="bill-card-chip">
                <Icon name="card" size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <div className="bill-card-num">
                  {FAKE_PAYMENT_METHOD.brand} ···· {FAKE_PAYMENT_METHOD.last4}
                </div>
                <div className="bill-card-exp">Caduca {FAKE_PAYMENT_METHOD.expiry}</div>
              </div>
              <Button type="button" variant="outline">
                <Icon name="edit" size={13} />
                Editar
              </Button>
            </div>
            <div className="bill-pay-row">
              <span className="bill-pay-k">
                <Icon name="mail" size={14} />
                Email de facturación
              </span>
              <span className="bill-pay-v">{FAKE_PAYMENT_METHOD.billingEmail}</span>
            </div>
            <div className="bill-pay-row">
              <span className="bill-pay-k">
                <Icon name="fileText" size={14} />
                Datos fiscales
              </span>
              <span className="bill-pay-v">
                {FAKE_PAYMENT_METHOD.legalName} · {FAKE_PAYMENT_METHOD.taxId}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Historial de facturas */}
        <Card>
          <CardHeader className="flex items-center gap-2.5">
            <span className="card-title">Historial de facturas</span>
            <span className="ml-auto">
              <Button type="button" variant="outline">
                <Icon name="download" size={13} />
                Exportar todo
              </Button>
            </span>
          </CardHeader>
          <div style={{ padding: "4px 0" }}>
            {FAKE_INVOICES.map((invoice, i) => (
              <div
                key={invoice.number}
                className="bill-inv"
                style={{
                  borderBottom: i < FAKE_INVOICES.length - 1 ? "1px solid var(--line-soft)" : "none"
                }}
              >
                <div className="bill-inv-ic">
                  <Icon name="fileText" size={15} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="bill-inv-id">{invoice.number}</div>
                  <div className="bill-inv-date">{invoice.date}</div>
                </div>
                <span className="tnum bill-inv-amt">{invoice.amount}</span>
                <span className="badge badge-pos">Pagada</span>
                <Button
                  type="button"
                  variant="outline"
                  aria-label={`Descargar factura ${invoice.number}`}
                >
                  <Icon name="download" size={13} />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      </div>
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
