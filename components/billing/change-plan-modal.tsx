"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
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

/** Mobile chips: the same four meters with their unit, so «1» reads «1 dominio». */
function planChips(p: Plan): string[] {
  const n = p.meter.projects;
  const domains = /^\d+$/.test(n) ? `${n} ${n === "1" ? "dominio" : "dominios"}` : `Dominios ${n.toLowerCase()}`;
  return [domains, `~${p.meter.prompts} prompts`, `${p.meter.engines} motores`, p.meter.refresh];
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
  // TRIAL-ONLY-1: `free` ya no es una opción del modal — es el estado de una
  // cuenta sin plan (prueba terminada o suscripción cancelada). Desde ahí la
  // selección arranca en Pro, el plan de la prueba.
  const [sel, setSel] = useState<Plan["id"]>(
    overageOnly ? currentId : (initialTargetId ?? (currentId === "free" ? "pro" : currentId))
  );
  const [step, setStep] = useState<"select" | "overage" | "done">(overageOnly ? "overage" : "select");
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
  const paidToPaidBlocked = hasRealSubscription && target.id !== "free" && target.id !== currentId;
  // Agency has no self-serve Stripe price (still "hablar con ventas" per
  // PRICING-TRUTH-1) — only Starter<->Pro can be deep-linked into the
  // Portal's plan-switch flow.
  const paidToPaidSelfServe = paidToPaidBlocked && target.id !== "agency";
  const requiredArchiveCount = Math.max(0, activeProjects.length - target.caps.projects);
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

  const RANK: Record<Plan["id"], number> = { free: 0, starter: 1, pro: 2, agency: 3 };
  // PLAN-MODAL-INSTRUMENTO-1 (log §394): Agencia is negotiated by hand, so an
  // Agencia account changes plan by talking to us, never from these cards.
  const locked = currentId === "agency";
  // The reverse trial is always Pro; a comped Agencia also has no Stripe
  // subscription, and it is not a trial.
  const onTrial = currentId === "pro" && !hasRealSubscription;
  const plansShown = PLANS.filter((p) => p.id !== "free");
  const canPick = (p: Plan) => !locked && p.id !== "agency" && !(p.id === currentId && !onTrial);
  const badgeFor = (p: Plan) =>
    p.id === currentId ? (onTrial ? "Tu prueba" : "Tu plan ahora") : null;
  // «Recomendado» only ever points up: never at the plan you have or below it.
  const recommendedFor = (p: Plan) => Boolean(p.recommended) && RANK[p.id] > RANK[currentId];
  const shownPrice = (p: Plan) =>
    p.promoPrice !== undefined && promoShown(p.id) ? { now: p.promoPrice, was: p.price } : { now: p.price, was: null };

  const canGo = !locked && !isSame && !isPending && (requiresCheckout || paidToPaidSelfServe);
  const goLabel = paidToPaidSelfServe
    ? isPending
      ? "Abriendo portal…"
      : "Ir al portal de Stripe"
    : isPending
      ? "Abriendo Stripe…"
      : "Ir a pagar";
  const moveLabel =
    onTrial && sel === currentId
      ? "Pasas de la prueba a"
      : currentId === "free"
        ? "Tu nuevo plan"
        : RANK[sel] < RANK[currentId]
          ? "Bajas a"
          : "Subes a";
  const targetShown = shownPrice(target);

  const dialog = (
    <div className="ins pmx">
      <div className="pm-scrim" onClick={close}>
        <div
          className="pm-dlg"
          role="dialog"
          aria-modal="true"
          aria-label={step === "done" ? "Cambio confirmado" : "Cambiar de plan"}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pm-grab" aria-hidden="true" />
          <div className="pm-dh">
            <div className="pm-eb">{step === "done" ? "Cambio confirmado" : "Cambiar de plan"}</div>
            <h2>
              {step === "done"
                ? "Todo listo"
                : step === "overage"
                  ? "Ajusta tus dominios activos"
                  : locked
                    ? `Tu plan ${current.name}`
                    : currentId === "free" || onTrial
                      ? "Elige cómo sigues"
                      : "Cambiar de plan"}
            </h2>
            <p>
              {step === "overage"
                ? "Elige qué dominios mantener activos"
                : step === "done"
                  ? null
                  : locked
                    ? "Plan a medida. Para cambiarlo, hablamos contigo."
                    : currentId === "free"
                      ? "Tu prueba ha terminado. Tus datos siguen aquí."
                      : onTrial
                        ? "Estás en la prueba de Pro."
                        : `Estás en ${current.name} · ${planPrice(current)}`}
            </p>
            <button type="button" className="pm-x" onClick={close} aria-label="Cerrar" disabled={isPending}>
              <Icon name="x" size={16} />
            </button>
          </div>

          {step === "select" && (
            <>
              <div className="pm-b">
                <div className="pm-grid" role="radiogroup" aria-label="Elegir plan">
                  {plansShown.map((p) => {
                    const pick = canPick(p);
                    const on = pick && p.id === sel;
                    const isCur = p.id === currentId;
                    const badge = badgeFor(p);
                    const rec = recommendedFor(p);
                    const pr = shownPrice(p);
                    const isSales = p.id === "agency" && !isCur;
                    const cls =
                      "pm-c" +
                      (on ? " on" : "") +
                      (isCur ? " cur" : "") +
                      (isSales ? " sales" : "") +
                      (!pick && !isCur && !isSales ? " off" : "");
                    const inner = (
                      <>
                        <div className="pm-top">
                          <span className="pm-r" aria-hidden="true">
                            {on && <Icon name="check" size={13} />}
                          </span>
                          <div className="pm-id">
                            <div className="pm-nl">
                              <b className="pm-n">{p.name}</b>
                              {badge && <span className="pm-bd ink">{badge}</span>}
                              {rec && (
                                <span className="pm-bd blue">
                                  <Icon name="spark" size={10} />
                                  Recomendado
                                </span>
                              )}
                            </div>
                            <p className="pm-t">{p.tagline}</p>
                          </div>
                          <div className="pm-pr">
                            {p.priceLabel ? (
                              <b className="pm-ms">A medida</b>
                            ) : (
                              <>
                                {pr.was !== null && <s className="num">{money(pr.was, 0)}</s>}
                                <b className="num">{money(pr.now, 0)}</b>
                                <span>/mes</span>
                              </>
                            )}
                          </div>
                        </div>
                        <p className="pm-t pm-t2" aria-hidden="true">
                          {p.tagline}
                        </p>
                        <dl className="pm-m">
                          {METER_ROWS.map((row) => (
                            <div key={row.label}>
                              <dt>{row.label}</dt>
                              <dd className="num">{row.get(p)}</dd>
                            </div>
                          ))}
                        </dl>
                        <div className="pm-chips">
                          {planChips(p).map((c) => (
                            <span key={c}>{c}</span>
                          ))}
                        </div>
                        {isSales && !locked && (
                          <a
                            className="pm-link"
                            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Plan Agencia")}`}
                          >
                            Hablar con ventas
                            <Icon name="arrRight" size={14} />
                          </a>
                        )}
                      </>
                    );
                    return pick ? (
                      <button
                        type="button"
                        key={p.id}
                        role="radio"
                        aria-checked={on}
                        className={cls}
                        onClick={() => setSel(p.id)}
                      >
                        {inner}
                      </button>
                    ) : (
                      <div key={p.id} className={cls}>
                        {inner}
                      </div>
                    );
                  })}
                </div>
                {paidToPaidSelfServe && !locked && (
                  <p className="pm-note">
                    <Icon name="info" size={14} />
                    <span>
                      Entre {current.name} y {target.name} el cambio se hace en el portal seguro de Stripe, donde también
                      ves tus facturas.
                    </span>
                  </p>
                )}
                {error && <p className="feedback error pm-err">{error}</p>}
              </div>
              <div className="pm-cart">
                {locked ? (
                  <>
                    <div className="pm-sum">
                      <span>Plan {current.name} · a medida</span>
                      <b>Escríbenos y lo ajustamos contigo</b>
                    </div>
                    <div className="pm-btns">
                      <button type="button" className="pm-btn ghost" onClick={close}>
                        Cerrar
                      </button>
                      <a
                        className="pm-btn ink"
                        href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Cambiar mi plan Agencia")}`}
                      >
                        Hablar con nosotros
                        <Icon name="arrRight" size={15} />
                      </a>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="pm-sum" aria-live="polite">
                      {isSame ? (
                        <>
                          <span>Ya estás en {current.name}</span>
                          <b className="mut">Elige otro plan para cambiar</b>
                        </>
                      ) : (
                        <>
                          <span>{moveLabel}</span>
                          <b>
                            {target.name} · <span className="num">{money(targetShown.now, 0)}</span>/mes
                            {targetShown.was !== null && <s className="num">{money(targetShown.was, 0)}</s>}
                          </b>
                          <span className="pm-lk">
                            <Icon name="lock" size={12} />
                            {paidToPaidSelfServe
                              ? "Lo confirmas en el portal seguro de Stripe"
                              : targetShown.was !== null
                                ? "Precio fundador para siempre · Pago seguro con Stripe"
                                : "Pago seguro con Stripe"}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="pm-btns">
                      <button type="button" className="pm-btn ghost" onClick={close} disabled={isPending}>
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="pm-btn ink"
                        disabled={!canGo}
                        onClick={paidToPaidSelfServe ? handleGoToPortal : handleGoToCheckout}
                      >
                        {!paidToPaidSelfServe && <Icon name="lock" size={14} />}
                        {goLabel}
                      </button>
                    </div>
                  </>
                )}
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
    </div>
  );

  // Portal to <body>: inside the console the modal sat in the page's stacking
  // context, under the mobile tab bar, which hid the footer and its button.
  return typeof document === "undefined" ? null : createPortal(dialog, document.body);
}
