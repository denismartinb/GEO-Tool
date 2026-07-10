"use client";

import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { PLANS, type Plan } from "@/app/pricing/plans-data";
import type { ActiveProjectSummary } from "@/lib/billing";
import type { CheckoutSessionResult, PortalIntent, PortalSessionResult } from "@/app/dashboard/settings/billing/actions";

const money = (n: number, dec = 2) =>
  n.toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + " €";

const METER_ROWS: Array<{ label: string; icon: string; get: (p: Plan) => string }> = [
  { label: "Dominios", icon: "globe", get: (p) => p.meter.projects },
  { label: "Prompts monitorizados", icon: "prompts", get: (p) => "~" + p.meter.prompts },
  { label: "Motores de IA", icon: "layers", get: (p) => String(p.meter.engines) },
  { label: "Frecuencia de refresco", icon: "refresh", get: (p) => p.meter.refresh }
];

function PlanMeterChips({ plan }: { plan: Plan }) {
  return (
    <div className="cp-plan-meter">
      {METER_ROWS.map((row) => (
        <span key={row.label} className="cp-chip">
          <Icon name={row.icon} size={11} />
          {row.get(plan)}
        </span>
      ))}
    </div>
  );
}

export function ChangePlanModal({
  currentId,
  initialTargetId,
  activeProjects,
  onClose,
  onApply,
  onCheckout,
  onManageBilling,
  overageOnly = false
}: {
  currentId: Plan["id"];
  initialTargetId?: Plan["id"];
  activeProjects: ActiveProjectSummary[];
  onClose: () => void;
  onApply: (targetId: Plan["id"], archiveProjectIds: string[]) => Promise<{ success: boolean; error?: string }>;
  /** BILLING-STRIPE-1: real Stripe Checkout Session for a Free -> paid move. */
  onCheckout: (targetId: Plan["id"]) => Promise<CheckoutSessionResult>;
  /** BILLING-STRIPE-1 PR 2: real Stripe Customer Portal session — payment method, invoices, cancellation, and paid<->paid plan switching. */
  onManageBilling: (intent?: PortalIntent) => Promise<PortalSessionResult>;
  /**
   * Opens straight into the archive picker for the CURRENT plan instead of a
   * plan-change flow — used when a Portal-driven change (switch or
   * cancellation, both outside this app) left the account over its own
   * plan's domain cap. The founder chose to always ask the owner which
   * domains to keep rather than auto-archiving on their behalf.
   */
  overageOnly?: boolean;
}) {
  const current = PLANS.find((p) => p.id === currentId)!;
  const [sel, setSel] = useState<Plan["id"]>(overageOnly ? currentId : (initialTargetId ?? currentId));
  const [step, setStep] = useState<"select" | "confirm" | "overage" | "done">(overageOnly ? "overage" : "select");
  const [error, setError] = useState<string | null>(null);
  const [archiveIds, setArchiveIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const close = () => {
    if (isPending) return;
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isPending]);

  const target = PLANS.find((p) => p.id === sel)!;
  const isSame = sel === currentId;

  // BILLING-STRIPE-1: only a Free -> paid move can go through Checkout (a
  // fresh subscription). Switching between two already-paid plans would
  // create a second parallel Stripe subscription instead of modifying the
  // existing one — that goes through the Customer Portal's in-place,
  // prorated subscription update instead (PR 2).
  const requiresCheckout = currentId === "free" && target.id !== "free";
  const isDowngradeToFree = currentId !== "free" && target.id === "free";
  const paidToPaidBlocked = currentId !== "free" && target.id !== "free" && target.id !== currentId;
  // Agency has no self-serve Stripe price (still "hablar con ventas" per
  // PRICING-TRUTH-1) — only Starter<->Pro can be deep-linked into the
  // Portal's plan-switch flow.
  const paidToPaidSelfServe = paidToPaidBlocked && target.id !== "agency";

  const diffs = METER_ROWS.filter((row) => row.get(current) !== row.get(target));

  const requiredArchiveCount = Math.max(0, activeProjects.length - target.caps.projects);
  const hasProjectOverage = isDowngradeToFree && requiredArchiveCount > 0;
  const archiveSelectionComplete = archiveIds.size === requiredArchiveCount;

  useEffect(() => {
    setArchiveIds(new Set());
  }, [sel]);

  function toggleArchiveId(id: string) {
    setArchiveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < requiredArchiveCount) {
        next.add(id);
      }
      return next;
    });
  }

  const footNote = isSame ? (
    "Selecciona un plan distinto al actual."
  ) : paidToPaidSelfServe ? (
    "Se gestiona en el portal seguro de Stripe."
  ) : paidToPaidBlocked ? (
    "Disponible muy pronto."
  ) : requiresCheckout ? (
    "Se abre el pago seguro de Stripe."
  ) : (
    "Se aplica de inmediato al confirmar."
  );

  const handleConfirmDowngrade = () => {
    setError(null);
    startTransition(async () => {
      const result = await onApply(sel, Array.from(archiveIds));
      if (result.success) {
        setStep("done");
      } else {
        setError(result.error ?? "No se pudo guardar el cambio de plan.");
      }
    });
  };

  const handleGoToCheckout = () => {
    setError(null);
    startTransition(async () => {
      const result = await onCheckout(sel);
      if (result.success) {
        window.location.href = result.url;
      } else {
        setError(result.error);
      }
    });
  };

  const handleGoToPortal = () => {
    setError(null);
    startTransition(async () => {
      // paidToPaidSelfServe already excludes "free" and "agency", so this is
      // always "starter" or "pro" here.
      const result = await onManageBilling({ type: "update", planId: sel as "starter" | "pro" });
      if (result.success) {
        window.location.href = result.url;
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="cp-scrim" onClick={close}>
      <div
        className="cp-modal"
        role="dialog"
        aria-modal="true"
        aria-label={step === "done" ? "Cambio confirmado" : "Cambiar de plan"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cp-head">
          <div className="cp-head-ic">
            <Icon name="grid" size={20} />
          </div>
          <div>
            <h3>
              {step === "done" ? "Cambio confirmado" : step === "overage" ? "Ajusta tus dominios activos" : "Cambiar de plan"}
            </h3>
            <p>
              {step === "select" && (
                <>
                  Estás en <b style={{ color: "var(--ink-2)" }}>{current.name}</b> · {money(current.price, 0)}/mes
                </>
              )}
              {step === "confirm" &&
                (requiresCheckout ? "Vas a completar el pago en Stripe" : "Revisa qué cambia antes de confirmar")}
              {step === "overage" && "Elige qué dominios mantener activos"}
              {step === "done" && "Todo listo"}
            </p>
          </div>
          <button type="button" className="cp-close" onClick={close} aria-label="Cerrar" disabled={isPending}>
            <Icon name="x" size={18} />
          </button>
        </div>

        {step === "select" && (
          <>
            <div className="cp-body">
              <div className="cp-plans" role="radiogroup" aria-label="Elegir plan">
                {PLANS.map((p) => {
                  const isCur = p.id === currentId;
                  const isSel = p.id === sel;
                  const flag = isCur ? "cur" : p.recommended ? "rec" : null;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      role="radio"
                      aria-checked={isSel}
                      className={"cp-plan" + (isSel ? " sel" : "") + (isCur ? " cur" : "") + (flag ? " has-flag" : "")}
                      onClick={() => setSel(p.id)}
                    >
                      {flag && (
                        <span className={"cp-flag " + flag}>
                          {isCur ? (
                            "Plan actual"
                          ) : (
                            <>
                              <Icon name="spark" size={10} />
                              Recomendado
                            </>
                          )}
                        </span>
                      )}
                      <span className="cp-radio" />
                      <div className="cp-plan-top">
                        <span className="cp-plan-name">{p.name}</span>
                        <span className="cp-plan-price">
                          {money(p.price, 0)}
                          <span className="per">/{p.id === "free" ? "" : "mes"}</span>
                        </span>
                      </div>
                      <div className="cp-plan-tag">{p.tagline}</div>
                      <PlanMeterChips plan={p} />
                    </button>
                  );
                })}
              </div>
              {paidToPaidSelfServe && (
                <p className="cp-pror-note" style={{ marginTop: 14 }}>
                  <Icon name="info" size={14} />
                  <span>
                    Cambiar entre {current.name} y {target.name} se gestiona en el portal seguro de Stripe, donde
                    también puedes cancelar o ver tus facturas.
                  </span>
                </p>
              )}
              {paidToPaidBlocked && !paidToPaidSelfServe && (
                <p className="cp-pror-note" style={{ marginTop: 14 }}>
                  <Icon name="info" size={14} />
                  <span>
                    Cambiar a {target.name} estará disponible muy pronto. Mientras tanto, escríbenos a{" "}
                    <b>soporte@genscore.es</b>.
                  </span>
                </p>
              )}
              {error && (
                <p className="feedback error" style={{ marginTop: 14 }}>
                  {error}
                </p>
              )}
            </div>
            <div className="cp-foot">
              <div className="cp-foot-note">{footNote}</div>
              <Button type="button" variant="ghost" onClick={close}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={isSame || isPending || (paidToPaidBlocked && !paidToPaidSelfServe)}
                onClick={paidToPaidSelfServe ? handleGoToPortal : () => setStep("confirm")}
              >
                {paidToPaidSelfServe ? (isPending ? "Abriendo portal…" : "Ir al portal de Stripe") : "Continuar"}
                <Icon name="arrRight" size={15} />
              </Button>
            </div>
          </>
        )}

        {step === "confirm" && requiresCheckout && (
          <>
            <div className="cp-body">
              <div className="cp-move">
                <div className="cp-move-side">
                  <div className="cp-move-lbl">Actual</div>
                  <div className="cp-move-plan">
                    {current.name} <span className="per">· gratis</span>
                  </div>
                </div>
                <Icon name="arrRight" size={20} className="cp-move-arrow" />
                <div className="cp-move-side">
                  <div className="cp-move-lbl">Nuevo</div>
                  <div className="cp-move-plan">
                    {target.name} <span className="per">· {money(target.price, 0)}/mes</span>
                  </div>
                </div>
              </div>
              <div className="cp-pror-note" style={{ marginTop: 16 }}>
                <Icon name="info" size={14} />
                <span>
                  Al continuar, Stripe te pedirá los datos de pago en una página segura fuera de GenScore. Tu plan{" "}
                  {target.name} se activa en cuanto el pago se confirme.
                </span>
              </div>
              {error && (
                <p className="feedback error" style={{ marginTop: 14 }}>
                  {error}
                </p>
              )}
            </div>
            <div className="cp-foot">
              <div className="cp-foot-note">
                {money(target.price, 0)}/mes
              </div>
              <Button type="button" variant="ghost" onClick={() => setStep("select")} disabled={isPending}>
                <Icon name="chevLeft" size={15} />
                Atrás
              </Button>
              <Button type="button" disabled={isPending} onClick={handleGoToCheckout}>
                {isPending ? "Abriendo Stripe…" : "Ir a pagar"}
                <Icon name="arrRight" size={15} />
              </Button>
            </div>
          </>
        )}

        {step === "confirm" && !requiresCheckout && (
          <>
            <div className="cp-body">
              <div className="cp-confirm-head">
                <span className="cp-confirm-badge down">
                  <Icon name="arrDown" size={13} />
                  Bajada de plan
                </span>
              </div>

              <div className="cp-move">
                <div className="cp-move-side">
                  <div className="cp-move-lbl">Actual</div>
                  <div className="cp-move-plan">
                    {current.name} <span className="per">· {money(current.price, 0)}/mes</span>
                  </div>
                </div>
                <Icon name="arrRight" size={20} className="cp-move-arrow" />
                <div className="cp-move-side">
                  <div className="cp-move-lbl">Nuevo</div>
                  <div className="cp-move-plan">
                    {target.name} <span className="per">· gratis</span>
                  </div>
                </div>
              </div>

              <div className="cp-pror-note" style={{ marginTop: 16 }}>
                <Icon name="info" size={14} />
                <span>
                  El cambio a <b>{target.name}</b> se aplica de inmediato y cancela cualquier suscripción activa —
                  no se te volverá a cobrar.
                </span>
              </div>
              {diffs.length > 0 && (
                <div className="cp-diff">
                  <div className="cp-diff-h">
                    <Icon name="alertCircle" size={14} />
                    Qué se reduce al bajar a {target.name}
                  </div>
                  <ul className="cp-diff-list">
                    {diffs.map((d) => (
                      <li key={d.label}>
                        <Icon name={d.icon} size={14} />
                        <span className="k">{d.label}</span>
                        <span className="from">{d.get(current)}</span>
                        <Icon name="arrRight" size={13} />
                        <span className="to">{d.get(target)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {hasProjectOverage && (
                <div className="cp-diff">
                  <div className="cp-diff-h">
                    <Icon name="alertCircle" size={14} />
                    Elige {requiredArchiveCount} dominio{requiredArchiveCount === 1 ? "" : "s"} para archivar (tienes{" "}
                    {activeProjects.length}, {target.name} permite {target.caps.projects})
                  </div>
                  <ul className="cp-diff-list" role="group" aria-label="Dominios a archivar">
                    {activeProjects.map((project) => {
                      const checked = archiveIds.has(project.id);
                      const disableUnchecked = !checked && archiveIds.size >= requiredArchiveCount;
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
                              onChange={() => toggleArchiveId(project.id)}
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
                  <p className="cp-pror-note" style={{ marginTop: 10 }}>
                    <Icon name="info" size={14} />
                    <span>
                      Archivar es reversible: podrás restaurarlos cuando quieras desde "Dominios", sin perder su
                      configuración ni sus escaneos.
                    </span>
                  </p>
                </div>
              )}
              {error && (
                <p className="feedback error" style={{ marginTop: 14 }}>
                  {error}
                </p>
              )}
            </div>
            <div className="cp-foot">
              <div className="cp-foot-note">
                Efectivo <b>de inmediato</b>
              </div>
              <Button type="button" variant="ghost" onClick={() => setStep("select")} disabled={isPending}>
                <Icon name="chevLeft" size={15} />
                Atrás
              </Button>
              <Button
                type="button"
                disabled={isPending || (hasProjectOverage && !archiveSelectionComplete)}
                onClick={handleConfirmDowngrade}
              >
                {isPending ? "Guardando…" : "Confirmar cambio"}
              </Button>
            </div>
          </>
        )}

        {step === "overage" && (
          <>
            <div className="cp-body">
              <div className="cp-pror-note">
                <Icon name="info" size={14} />
                <span>
                  Tienes <b>{activeProjects.length}</b> dominios activos y tu plan <b>{current.name}</b> permite{" "}
                  <b>{current.caps.projects}</b>. Elige {requiredArchiveCount} para archivar — el resto sigue
                  monitorizándose sin cambios.
                </span>
              </div>
              <div className="cp-diff">
                <div className="cp-diff-h">
                  <Icon name="alertCircle" size={14} />
                  Elige {requiredArchiveCount} dominio{requiredArchiveCount === 1 ? "" : "s"} para archivar
                </div>
                <ul className="cp-diff-list" role="group" aria-label="Dominios a archivar">
                  {activeProjects.map((project) => {
                    const checked = archiveIds.has(project.id);
                    const disableUnchecked = !checked && archiveIds.size >= requiredArchiveCount;
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
                            onChange={() => toggleArchiveId(project.id)}
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
                <p className="cp-pror-note" style={{ marginTop: 10 }}>
                  <Icon name="info" size={14} />
                  <span>
                    Archivar es reversible: podrás restaurarlos cuando quieras desde "Dominios", sin perder su
                    configuración ni sus escaneos.
                  </span>
                </p>
              </div>
              {error && (
                <p className="feedback error" style={{ marginTop: 14 }}>
                  {error}
                </p>
              )}
            </div>
            <div className="cp-foot">
              <div className="cp-foot-note">
                Efectivo <b>de inmediato</b>
              </div>
              <Button
                type="button"
                disabled={isPending || !archiveSelectionComplete}
                onClick={handleConfirmDowngrade}
              >
                {isPending ? "Guardando…" : "Confirmar archivado"}
              </Button>
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <div className="cp-done">
              <div className="cp-done-badge">
                <Icon name="check" size={30} />
              </div>
              <h3>{overageOnly ? "Dominios actualizados" : `Ya estás en ${target.name}`}</h3>
              <p>
                {overageOnly ? (
                  <>
                    Tus dominios activos ya encajan en el plan <b>{current.name}</b>.
                  </>
                ) : (
                  <>
                    Tu plan <b>{target.name}</b> está activo desde ahora. Puedes cambiarlo cuando quieras desde Plan y
                    facturación.
                  </>
                )}
              </p>
            </div>
            <div className="cp-foot" style={{ justifyContent: "flex-end" }}>
              <Button type="button" onClick={onClose}>
                Entendido
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
