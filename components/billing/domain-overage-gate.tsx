"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { PLANS, type Plan } from "@/app/pricing/plans-data";
import { supportMailto } from "@/lib/support";
import type { ActiveProjectSummary } from "@/lib/billing";
import { deleteProjects } from "@/app/dashboard/projects/actions";
import { createCheckoutSession, createPortalSession } from "@/app/dashboard/settings/billing/actions";

type Step = "choose" | "retire-select" | "retire-confirm" | "retire-done" | "upgrade-pick";

/**
 * DOMAINS-OVERAGE-GATE-1 (founder-approved Task Intake): the blocking
 * counterpart to `ChangePlanModal`'s dismissible `overageOnly` step. Mounted
 * unconditionally from `app/dashboard/layout.tsx` whenever
 * `getDomainOverage()` reports overage — deliberately its own component
 * rather than a reuse of `ChangePlanModal`, so the existing, already-shipped
 * archive-based "Elegir dominios" flow (reversible, user-initiated) keeps
 * its current behaviour untouched. This gate hard-deletes instead: no close
 * button, no Escape handler, no click-outside-to-dismiss — the scrim has no
 * `onClick` at all.
 */
export function DomainOverageGate({
  planId,
  planName,
  activeCount,
  cap,
  requiredRemoveCount,
  domains,
  hasStripeSubscription
}: {
  planId: Plan["id"];
  planName: string;
  activeCount: number;
  cap: number;
  requiredRemoveCount: number;
  domains: ActiveProjectSummary[];
  hasStripeSubscription: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("choose");
  const [removeIds, setRemoveIds] = useState<Set<string>>(new Set());
  const [understood, setUnderstood] = useState(false);
  const [selectedUpgradeId, setSelectedUpgradeId] = useState<Plan["id"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const upgradeOptions = PLANS.filter(
    (p) => (p.id === "starter" || p.id === "pro") && p.id !== planId && p.caps.projects >= activeCount
  );
  const agencyPlan = PLANS.find((p) => p.id === "agency")!;
  const selectedRemoveDomains = domains.filter((project) => removeIds.has(project.id));

  function toggleRemove(id: string) {
    setRemoveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < requiredRemoveCount) {
        next.add(id);
      }
      return next;
    });
  }

  function handleConfirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteProjects(Array.from(removeIds));
      if (result.success) {
        setStep("retire-done");
      } else {
        setError(result.error);
      }
    });
  }

  function handleUpgrade() {
    if (!selectedUpgradeId) return;
    setError(null);
    startTransition(async () => {
      const result = hasStripeSubscription
        ? await createPortalSession({ type: "update", planId: selectedUpgradeId as "starter" | "pro" })
        : await createCheckoutSession(selectedUpgradeId);
      if (result.success) {
        window.location.href = result.url;
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="cp-scrim dog-scrim" role="presentation">
      <div className="cp-modal" role="dialog" aria-modal="true" aria-label="Ajusta tus dominios activos">
        {step === "choose" && (
          <>
            <div className="cp-head">
              <div className="cp-head-ic">
                <Icon name="alertCircle" size={20} />
              </div>
              <div>
                <h3>Tu plan no cubre todos tus dominios</h3>
                <p>
                  Tienes <b>{activeCount}</b> dominios activos y tu plan <b>{planName}</b> permite <b>{cap}</b>.
                  Antes de seguir, elige cómo quieres continuar.
                </p>
              </div>
            </div>
            <div className="cp-body">
              <div className="dog-opts">
                <button type="button" className="dog-opt dog-danger-opt" onClick={() => setStep("retire-select")}>
                  <span className="dog-opt-ic dog-danger-ic">
                    <Icon name="trash" size={16} />
                  </span>
                  <span className="dog-opt-t">Retirar dominios</span>
                  <span className="dog-opt-d">Elige cuáles conservar. Los demás se eliminan de forma permanente.</span>
                </button>
                <button type="button" className="dog-opt" onClick={() => setStep("upgrade-pick")}>
                  <span className="dog-opt-ic">
                    <Icon name="arrUp" size={16} />
                  </span>
                  <span className="dog-opt-t">Subir de plan</span>
                  <span className="dog-opt-d">
                    Sube a un plan con más capacidad y conserva tus {activeCount} dominios tal cual.
                  </span>
                </button>
              </div>
              {error && (
                <p className="feedback error" style={{ marginTop: 14 }}>
                  {error}
                </p>
              )}
            </div>
            <div className="cp-foot">
              <span className="cp-foot-note">No puedes seguir usando la consola hasta resolverlo.</span>
            </div>
          </>
        )}

        {step === "retire-select" && (
          <>
            <div className="cp-head">
              <div className="cp-head-ic">
                <Icon name="alertCircle" size={20} />
              </div>
              <div>
                <h3>Elige qué dominios retirar</h3>
                <p>
                  Elige {requiredRemoveCount} dominio{requiredRemoveCount === 1 ? "" : "s"} para retirar — el resto
                  sigue monitorizándose sin cambios.
                </p>
              </div>
            </div>
            <div className="cp-body">
              <div className="cp-diff">
                <div className="cp-diff-h">
                  <Icon name="alertCircle" size={14} />
                  {removeIds.size} de {requiredRemoveCount} seleccionados
                </div>
                <ul className="cp-diff-list" role="group" aria-label="Dominios a retirar">
                  {domains.map((project) => {
                    const checked = removeIds.has(project.id);
                    const disableUnchecked = !checked && removeIds.size >= requiredRemoveCount;
                    return (
                      <li key={project.id}>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            width: "100%",
                            cursor: disableUnchecked ? "not-allowed" : "pointer"
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disableUnchecked}
                            onChange={() => toggleRemove(project.id)}
                          />
                          <span className="k">{project.name}</span>
                          <span className="from" style={{ textDecoration: "none" }}>
                            {project.domain}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {error && (
                <p className="feedback error" style={{ marginTop: 14 }}>
                  {error}
                </p>
              )}
            </div>
            <div className="cp-foot">
              <span className="cp-foot-note">El siguiente paso pide confirmar — nada se borra todavía.</span>
              <Button type="button" variant="ghost" onClick={() => setStep("choose")}>
                Atrás
              </Button>
              <Button
                type="button"
                disabled={removeIds.size !== requiredRemoveCount}
                onClick={() => setStep("retire-confirm")}
              >
                Continuar
                <Icon name="arrRight" size={15} />
              </Button>
            </div>
          </>
        )}

        {step === "retire-confirm" && (
          <>
            <div className="cp-head">
              <div className="cp-head-ic dog-danger-ic">
                <Icon name="trash" size={18} />
              </div>
              <div>
                <h3>
                  Vas a eliminar {removeIds.size} dominio{removeIds.size === 1 ? "" : "s"}
                </h3>
                <p>
                  Esta acción es <b>permanente</b> — no se puede deshacer.
                </p>
              </div>
            </div>
            <div className="cp-body">
              <div className="cp-diff dog-diff-danger">
                <div className="cp-diff-h">
                  <Icon name="alertCircle" size={14} />
                  Se borra todo lo asociado a cada uno
                </div>
                <ul className="cp-diff-list">
                  {selectedRemoveDomains.map((project) => (
                    <li key={project.id}>
                      <span className="k">{project.name}</span>
                      <span className="from" style={{ textDecoration: "none" }}>
                        {project.domain} — escaneos, prompts, competidores, recomendaciones y soluciones generadas
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <label className="dog-confirm-check">
                <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
                Entiendo que esta acción no se puede deshacer.
              </label>
              <p style={{ marginTop: 12 }}>
                <button type="button" className="dog-link" onClick={() => setStep("upgrade-pick")} disabled={isPending}>
                  Prefiero subir de plan en su lugar
                </button>
              </p>
              {error && (
                <p className="feedback error" style={{ marginTop: 14 }}>
                  {error}
                </p>
              )}
            </div>
            <div className="cp-foot">
              <Button type="button" variant="ghost" onClick={() => setStep("retire-select")} disabled={isPending}>
                Atrás
              </Button>
              <Button type="button" variant="destructive" disabled={!understood || isPending} onClick={handleConfirmDelete}>
                {isPending ? "Eliminando…" : "Eliminar definitivamente"}
              </Button>
            </div>
          </>
        )}

        {step === "retire-done" && (
          <div className="cp-done">
            <div className="cp-done-badge">
              <Icon name="check" size={30} />
            </div>
            <h3>Dominios actualizados</h3>
            <p>
              Ya encajas en tu plan <b>{planName}</b>. Los dominios retirados se eliminaron de forma permanente.
            </p>
            <div className="cp-foot" style={{ justifyContent: "flex-end", marginTop: 18 }}>
              <Button type="button" onClick={() => router.refresh()}>
                Entendido
              </Button>
            </div>
          </div>
        )}

        {step === "upgrade-pick" && (
          <>
            <div className="cp-head">
              <div className="cp-head-ic">
                <Icon name="arrUp" size={18} />
              </div>
              <div>
                <h3>Sube de plan</h3>
                <p>Conserva tus {activeCount} dominios sin retirar ninguno.</p>
              </div>
            </div>
            <div className="cp-body">
              {upgradeOptions.length > 0 ? (
                <div className="cp-plans" role="radiogroup" aria-label="Elegir plan">
                  {upgradeOptions.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      role="radio"
                      aria-checked={selectedUpgradeId === p.id}
                      className={"cp-plan" + (selectedUpgradeId === p.id ? " sel" : "")}
                      onClick={() => setSelectedUpgradeId(p.id)}
                    >
                      <span className="cp-radio" />
                      <div className="cp-plan-top">
                        <span className="cp-plan-name">{p.name}</span>
                        <span className="cp-plan-price">
                          {p.price}&nbsp;€<span className="per">/mes</span>
                        </span>
                      </div>
                      <div className="cp-plan-tag">
                        {p.meter.projects} dominios · ~{p.meter.prompts} prompts
                      </div>
                    </button>
                  ))}
                  <div className="cp-sales">
                    <div>
                      <div className="cp-sales-t">{agencyPlan.name}</div>
                      <div className="cp-sales-d">{agencyPlan.tagline}</div>
                    </div>
                    <a className="cp-sales-cta" href={supportMailto("Plan Agencia")}>
                      Hablar con ventas
                      <Icon name="arrRight" size={14} />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="cp-sales dog-sales-full">
                  <div>
                    <div className="cp-sales-t">{agencyPlan.name}</div>
                    <div className="cp-sales-d">Con {activeCount} dominios activos necesitas un plan a medida.</div>
                  </div>
                  <a className="cp-sales-cta" href={supportMailto("Plan Agencia")}>
                    Hablar con ventas
                    <Icon name="arrRight" size={14} />
                  </a>
                </div>
              )}
              {error && (
                <p className="feedback error" style={{ marginTop: 14 }}>
                  {error}
                </p>
              )}
            </div>
            <div className="cp-foot">
              <span className="cp-foot-note">Se abre el pago seguro de Stripe</span>
              <Button type="button" variant="ghost" onClick={() => setStep("choose")} disabled={isPending}>
                Atrás
              </Button>
              <Button type="button" disabled={!selectedUpgradeId || isPending} onClick={handleUpgrade}>
                {isPending ? "Abriendo…" : "Continuar"}
                <Icon name="arrRight" size={15} />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
