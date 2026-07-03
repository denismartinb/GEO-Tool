"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PLANS, type Plan } from "@/app/pricing/plans-data";
import { ChangePlanModal } from "@/components/billing/change-plan-modal";
import { changePlan, type ChangePlanResult } from "@/app/dashboard/settings/billing/actions";
import type { UsageSummary } from "@/lib/billing";

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

export function PlanBillingSection({
  currentPlanId,
  agencyPlanId,
  usage
}: {
  currentPlanId: Plan["id"];
  agencyPlanId: Plan["id"];
  usage: UsageSummary;
}) {
  const [planId, setPlanId] = useState<Plan["id"]>(currentPlanId);
  const [modal, setModal] = useState<{ initialTargetId?: Plan["id"] } | null>(null);

  const current = PLANS.find((p) => p.id === planId)!;
  const agencyPlan = PLANS.find((p) => p.id === agencyPlanId)!;

  const applyChange = async (id: Plan["id"]): Promise<ChangePlanResult> => {
    const result = await changePlan(id);
    if (result.success) {
      setPlanId(id);
    }
    return result;
  };

  return (
    <>
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
                <p className="text-base font-semibold text-[var(--ink)]">{current.name}</p>
                <span className="badge badge-accent">Plan actual</span>
              </div>
              <p className="text-lg font-bold text-[var(--ink)]">
                {current.price}&nbsp;€/{current.period}
              </p>
            </div>
            <p className="sub mt-1">{current.tagline}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm text-[var(--ink-2)]">
              {current.highlights.map((highlight) => (
                <li key={highlight} className="flex items-start gap-2">
                  <Icon name="check" size={15} className="mt-0.5 shrink-0 text-[var(--pos)]" />
                  {highlight}
                </li>
              ))}
            </ul>
            <div className="flex gap-2 border-t border-[var(--line-soft)] pt-4">
              <Button type="button" onClick={() => setModal({})}>
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
            <Button
              type="button"
              className="w-full justify-center"
              onClick={() => setModal({ initialTargetId: agencyPlan.id })}
            >
              Comparar planes
              <Icon name="arrRight" size={14} />
            </Button>
          </CardContent>
        </Card>
      </section>

      {modal && (
        <ChangePlanModal
          currentId={planId}
          initialTargetId={modal.initialTargetId}
          onClose={() => setModal(null)}
          onApply={applyChange}
        />
      )}
    </>
  );
}
