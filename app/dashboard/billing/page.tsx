import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { getUsageSummary } from "@/lib/billing";
import { PLANS } from "@/app/pricing/plans-data";

const currentPlan = PLANS.find((plan) => plan.id === "pro")!;

function UsageRow({ label, value, cap }: { label: string; value: number; cap: number }) {
  const pct = cap > 0 ? Math.min(100, Math.round((value / cap) * 100)) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-[var(--ink-2)]">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-[var(--ink)]">
          {value}/{cap}
        </span>
      </div>
      <div className="run-bar-wrap">
        <div className="run-bar">
          <div className="run-bar-fill" style={{ width: `${pct}%`, background: "var(--accent)" }} />
        </div>
      </div>
    </div>
  );
}

export default async function BillingPage() {
  const usage = await getUsageSummary();

  return (
    <div className="page space-y-5">
      <p className="kicker">Cuenta</p>
      <h1 className="title-lg">Plan y facturación</h1>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="sub">Tu plan</p>
              <p className="mt-1 text-lg font-semibold text-[var(--ink)]">
                {currentPlan.name} · {currentPlan.price}€/{currentPlan.period}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-1.5 text-sm text-[var(--ink-2)]">
            {currentPlan.highlights.map((highlight) => (
              <li key={highlight}>· {highlight}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button type="button" variant="outline">Cambiar de plan</Button>
            <Button type="button" variant="ghost">Cancelar suscripción</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <p className="sub">Uso de este ciclo</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <UsageRow label="Prompts monitorizados" value={usage.promptCount} cap={usage.promptCap} />
          <UsageRow label="Proyectos / dominios" value={usage.projectCount} cap={usage.projectCap} />
          <UsageRow label="Motores de IA" value={usage.engineCount} cap={usage.engineCap} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <p className="sub">Pago y facturas</p>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="Facturación próximamente"
            description="La gestión del método de pago y el historial de facturas estarán disponibles cuando activemos la facturación."
          />
        </CardContent>
      </Card>
    </div>
  );
}
