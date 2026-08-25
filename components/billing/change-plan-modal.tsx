"use client";

import { useEffect, useState, useTransition } from "react";
import { SUPPORT_EMAIL } from "@/lib/support";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { PLANS, type Plan } from "@/app/pricing/plans-data";
import type { ActiveProjectSummary } from "@/lib/billing";
import type { CheckoutSessionResult, PortalIntent, PortalSessionResult } from "@/app/dashboard/settings/billing/actions";

const money = (n: number, dec = 2) =>
  n.toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + " €";

/** "449 €/mes" for priced plans, the negotiable label ("A medida") for plans that don't advertise a price. */
const planPrice = (p: Plan, suffix = "/mes") => (p.priceLabel ? p.priceLabel : money(p.price, 0) + suffix);

const METER_ROWS: Array<{ label: string; icon: string; get: (p: Plan) => string }> = [
  { label: "Dominios", icon: "globe", get: (p) => p.meter.projects },
  { label: "Prompts monitorizados", icon: "prompts", get: (p) => "~" + p.meter.prompts },
  { label: "Motores de IA", icon: "layers", get: (p) => String(p.meter.engines) },
  { label: "Frecuencia de escaneo", icon: "refresh", get: (p) => p.meter.refresh }
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
  hasRealSubscription,
  promoPlanIds = [],
  onClose,
  onApply,
  onCheckout,
  onManageBilling,
  overageOnly = false
}: {
  currentId: Plan["id"];
  initialTargetId?: Plan["id"];
  activeProjects: ActiveProjectSummary[];
  /**
   * BILLING-STRIPE-1 PR 3: whether `currentId` is backed by a real Stripe
   * subscription, as opposed to an unconverted reverse trial. A trialing
   * account's `current_plan` can already be "pro" with nothing to show for
   * it in Stripe — selecting that same plan must still go through Checkout
   * (a first real subscription), not be treated as a no-op or routed to the
   * Portal (which has no subscription/customer to manage yet).
   */
  hasRealSubscription: boolean;
  /**
   * PRICING-PROMO-1: plans with an active, Stripe-backed promo right now
   * (`billing-content.tsx` → `getActivePromoPlanIds()`). Only ever shown to
   * an account with `!hasRealSubscription` — anyone with a real subscription
   * switching Starter<->Pro goes through the Stripe Portal (see
   * `paidToPaidSelfServe` below), which this promo does not reach, so
   * showing a promo price there would be a price the Portal won't charge.
   */
  promoPlanIds?: string[];
  onClose: () => void;
  onApply: (targetId: Plan["id"], archiveProjectIds: string[]) => Promise<{ success: boolean; error?: string }>;
  /** BILLING-STRIPE-1: real Stripe Checkout Session for a Free -> paid move (or converting a trial to a real subscription). */
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
  // Selecting the plan you're already trialing (current_plan matches, but no
  // real subscription backs it) is not a no-op — it's the "start paying for
  // real" action, so it must NOT be treated the same as re-selecting a plan
  // you already pay for.
  const isSame = sel === currentId && (currentId === "free" || hasRealSubscription);

  // PRICING-PROMO-1: true for exactly the accounts for whom picking any
  // self-serve plan here actually goes through Checkout (see `requiresCheckout`
  // below, which depends on `hasRealSubscription` the same way but per-target) —
  // never for an account with a real subscription, since that always routes to
  // the Portal instead, which this promo cannot apply to.
  const promoShown = (planId: Plan["id"]) => !hasRealSubscription && promoPlanIds.includes(planId);

  const isSelfServeTarget = target.id === "starter" || target.id === "pro";
  // BILLING-STRIPE-1: a fresh Checkout Session (as opposed to the Customer
  // Portal's in-place, prorated update) is needed whenever there's no real
  // subscription yet to modify — a Free account, or a reverse-trial account
  // converting to a real paid plan for the first time (PR 3).
  const requiresCheckout = !hasRealSubscription && isSelfServeTarget;
  const isDowngradeToFree = currentId !== "free" && target.id === "free";
  const paidToPaidBlocked = hasRealSubscription && target.id !== "free" && target.id !== currentId;
  // Agency has no self-serve Stripe price (still "hablar con ventas" per
  // PRICING-TRUTH-1) — only Starter<->Pro can be deep-linked into the
  // Portal's plan-switch flow.
  const paidToPaidSelfServe = paidToPaidBlocked && target.id !== "agency";
  // CONSOLE-REDESIGN-1: Agency is no longer a selectable radio. It used to be
  // one, so you could pick it and then find "Continuar" switched off with two
  // different explanations on screen ("Disponible muy pronto" at the foot,
  // "escríbenos a soporte" in the note) — a dead end that let someone choose
  // something they could not have. It now renders as its own cell with a real
  // way out (SUPPORT_EMAIL), and `sel` can never hold it.
  const agencyPlan = PLANS.find((p) => p.id === "agency")!;
  const selectablePlans = PLANS.filter((p) => p.id !== "agency");

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
                  Estás en <b style={{ color: "var(--ink-2)" }}>{current.name}</b> · {planPrice(current)}
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
                {selectablePlans.map((p) => {
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
                          {p.priceLabel ? (
                            p.priceLabel
                          ) : p.promoPrice !== undefined && promoShown(p.id) ? (
                            <>
                              <span className="was">{money(p.price, 0)}</span>
                              <span className="now">
                                {money(p.promoPrice, 0)}
                                <span className="per">/mes</span>
                              </span>
                            </>
                          ) : (
                            <>
                              {money(p.price, 0)}
                              <span className="per">{p.id === "free" ? "" : "/mes"}</span>
                            </>
                          )}
                        </span>
                      </div>
                      <div className="cp-plan-tag">{p.tagline}</div>
                      <PlanMeterChips plan={p} />
                    </button>
                  );
                })}

                {/* Same cell of the grid, but not a radio: Agencia has no
                    self-serve Stripe price (PRICING-TRUTH-1), so it gets a way
                    out instead of a selection that leads nowhere. */}
                <div className="cp-sales">
                  <div>
                    <div className="cp-sales-t">{agencyPlan.name}</div>
                    <div className="cp-sales-d">{agencyPlan.tagline}</div>
                    <PlanMeterChips plan={agencyPlan} />
                  </div>
                  <a className="cp-sales-cta" href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Plan Agencia")}`}>
                    Hablar con ventas
                    <Icon name="arrRight" size={14} />
                  </a>
                </div>
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
                disabled={isSame || isPending}
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
                    {target.name} <span className="per">· {planPrice(target)}</span>
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
                {planPrice(target)}
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
                    {current.name} <span className="per">· {planPrice(current)}</span>
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
                    Elige {requiredArchiveCount} dominio{requiredArchiveCount === 1 ? "" : "s"} para retirar (tienes{" "}
                    {activeProjects.length}, {target.name} permite {target.caps.projects})
                  </div>
                  <ul className="cp-diff-list" role="group" aria-label="Dominios a retirar">
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
                      Los dominios que elijas dejan de monitorizarse y salen de tu espacio de trabajo. Para
                      recuperar uno, vuelve a añadirlo desde &laquo;Nuevo dominio&raquo;: se reactiva con sus
                      prompts, sus competidores y sus escaneos anteriores.
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
                  <b>{current.caps.projects}</b>. Elige {requiredArchiveCount} para retirar — el resto sigue
                  monitorizándose sin cambios.
                </span>
              </div>
              <div className="cp-diff">
                <div className="cp-diff-h">
                  <Icon name="alertCircle" size={14} />
                  Elige {requiredArchiveCount} dominio{requiredArchiveCount === 1 ? "" : "s"} para retirar
                </div>
                <ul className="cp-diff-list" role="group" aria-label="Dominios a retirar">
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
                    Los dominios que elijas dejan de monitorizarse y salen de tu espacio de trabajo. Para
                    recuperar uno, vuelve a añadirlo desde &laquo;Nuevo dominio&raquo;: se reactiva con sus
                    prompts, sus competidores y sus escaneos anteriores.
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
                {isPending ? "Guardando…" : "Confirmar retirada"}
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
