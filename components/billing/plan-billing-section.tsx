"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Ic } from "@/components/ins/ic";
import { Bar } from "@/components/ins/kit/bar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  PLANS,
  resolveShownPromoPrice,
  type Plan
} from "@/app/pricing/plans-data";
import { ChangePlanModal } from "@/components/billing/change-plan-modal";
import {
  changePlan,
  createCheckoutSession,
  createPortalSession,
  type ChangePlanResult
} from "@/app/dashboard/settings/billing/actions";
import type { ActiveProjectSummary, UsageSummary } from "@/lib/billing";

function UsageRow({ label, value, cap }: { label: string; value: number; cap: number }) {
  // A cap this high is "no cap" in practice (Agencia); a bar against 999 would
  // read as an empty gauge and the figure as a limit that does not exist.
  const unlimited = cap >= 999;
  const atCap = !unlimited && cap > 0 && value >= cap;
  return (
    <div className="pf-use">
      <div className="h">
        <span>{label}</span>
        <b className="num">
          {value}
          <small>{unlimited ? " · sin tope" : `/${cap}`}</small>
        </b>
      </div>
      {unlimited ? null : (
        <Bar value={value} max={cap} cls={`thin lit${atCap ? " ink" : ""}`} label={`${label}: ${value} de ${cap}`} />
      )}
      {atCap ? <span className="full">Completo</span> : null}
    </div>
  );
}

export function PlanBillingSection({
  currentPlanId,
  agencyPlanId,
  usage,
  activeProjects,
  promoPlanIds = [],
  openPlanId
}: {
  currentPlanId: Plan["id"];
  agencyPlanId: Plan["id"];
  usage: UsageSummary;
  activeProjects: ActiveProjectSummary[];
  /** PRICING-PROMO-1: plans with an active, Stripe-backed promo right now — see billing-content.tsx. */
  promoPlanIds?: string[];
  /**
   * PRECIO-BUTTONS-CONSOLE-1: opens "Cambiar de plan" on this plan as soon as
   * the section mounts — the deep link from a `/precios` CTA clicked while
   * logged in (`?openPlan=<id>`, validated by the page). Read once into the
   * initial state below, not in an effect: an effect would flash the closed
   * card for a frame before opening the modal.
   */
  openPlanId?: Plan["id"];
}) {
  const [planId, setPlanId] = useState<Plan["id"]>(currentPlanId);
  const [projects, setProjects] = useState<ActiveProjectSummary[]>(activeProjects);
  const [modal, setModal] = useState<{ initialTargetId?: Plan["id"]; overageOnly?: boolean } | null>(
    openPlanId ? { initialTargetId: openPlanId } : null
  );
  const [portalError, setPortalError] = useState<string | null>(null);
  const [isPortalPending, startPortalTransition] = useTransition();

  const current = PLANS.find((p) => p.id === planId)!;
  const agencyPlan = PLANS.find((p) => p.id === agencyPlanId)!;

  // BILLING-STRIPE-1 PR 2: a plan/cancellation change made in the Stripe
  // Customer Portal (outside this app) can leave the account over its new
  // plan's domain cap — the webhook that syncs `current_plan` deliberately
  // does not auto-archive anything (founder's choice: always let the owner
  // pick which domains to keep, never decide for them).
  //
  // TRIAL-ONLY-1: never for `free`. Without a plan the account is read-only —
  // nothing scans, so extra domains cost nothing and asking the owner to
  // archive them would only take their own data away.
  const isOverCapacity = planId !== "free" && projects.length > current.caps.projects;

  const trialDaysLeft = usage.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(usage.trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null;

  const applyChange = async (id: Plan["id"], archiveProjectIds: string[]): Promise<ChangePlanResult> => {
    const result = await changePlan(id, archiveProjectIds);
    if (result.success) {
      setPlanId(id);
      if (archiveProjectIds.length) {
        setProjects((rows) => rows.filter((row) => !archiveProjectIds.includes(row.id)));
      }
    }
    return result;
  };

  const handleCancelSubscription = () => {
    setPortalError(null);
    startPortalTransition(async () => {
      const result = await createPortalSession({ type: "cancel" });
      if (result.success) {
        window.location.href = result.url;
      } else {
        setPortalError(result.error);
      }
    });
  };

  const handleManageBilling = () => {
    setPortalError(null);
    startPortalTransition(async () => {
      const result = await createPortalSession();
      if (result.success) {
        window.location.href = result.url;
      } else {
        setPortalError(result.error);
      }
    });
  };

  const cancelAtDate = usage.cancelAt
    ? new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" }).format(
        new Date(usage.cancelAt)
      )
    : null;

  // PRICING-PROMO-1: only trust promo data fetched for the plan actually
  // shown — `planId` can move locally (downgrade to Free, see `applyChange`)
  // without a refetch, and Free never carries a promo anyway.
  const activePromo = planId === currentPlanId ? usage.subscriptionPromo : null;

  /**
   * PROMO-CONSOLE-PARITY-1 (2026-08-27) — the launch price a NON-subscriber
   * would pay, on the one screen that was still hiding it.
   *
   * `activePromo` comes from Stripe and only exists once there is a real
   * subscription carrying the coupon. Someone on the free Pro trial has no
   * subscription yet, so this card, the settings index and the header pill all
   * quoted the list price — 179 €/mes — while `/precios` and the change-plan
   * modal, two clicks away, quoted 59 €. Same account, same instant, two
   * prices (founder, 2026-08-27).
   *
   * Deliberately a SEPARATE value from `activePromo`, never a fallback merged
   * into it, because the two say different things and the copy below has to
   * differ: `activePromo` is "what you are being charged, until this date read
   * off your own subscription" (§152), and this is "what you would be charged
   * if you subscribed before the campaign closes". Collapsing them would tell
   * a trial user they are already paying 59 €, which is the fake-metric
   * failure mode this codebase keeps writing rules about.
   *
   * Gated on `promoPlanIds` (FOUNDER-PRICE-1: the real Stripe coupons and the
   * founder slots left), so the screen can never advertise a discount
   * checkout would fail to apply.
   */
  const shownPromo = resolveShownPromoPrice({
    plan: current,
    activePromoPrice: activePromo?.promoPrice,
    promoPlanIds
  });
  const offeredPromoPrice = shownPromo?.kind === "offered" ? shownPromo.price : null;

  return (
    <>
      {/* CONSOLE-REDESIGN-1: these two banners used four hand-written hexes
          (#f0c36d, #fdf6e8, #92600a, #6b4b09) that bypassed the token system —
          a regression of BRAND-4 finding 2 in the very file BRAND-4 fixed.
          Now on --warn/--warn-soft/--warn-ink. The brand amber (--brand-warm,
          #FFB020) stays banned from UI: it belongs to the logo dot only. */}
      {isOverCapacity && (
        <div className="flex flex-col gap-3 rounded-[14px] border border-[var(--warn)] bg-[var(--warn-soft)] p-4 sm:flex-row sm:items-center sm:gap-4">
          <div className="order-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-white text-[var(--warn-ink)]">
            <Icon name="alertCircle" size={18} />
          </div>
          <p className="order-2 flex-1 text-sm text-[var(--warn-ink)]">
            Tienes <b>{projects.length}</b> dominios activos y tu plan {current.name} permite{" "}
            <b>{current.caps.projects}</b>. Elige cuáles mantener activos.
          </p>
          <Button
            type="button"
            variant="outline"
            className="order-3 shrink-0"
            onClick={() => setModal({ overageOnly: true })}
          >
            Elegir dominios
          </Button>
        </div>
      )}

      <section className={`pf-plan${planId === "free" ? " ro" : ""}`} aria-label="Tu plan">
        <div className="pf-pl">
          <div className="pf-ey">
            <span>Tu plan · facturación mensual</span>
            {planId === "free" ? (
              <span className="badge b-warm">Solo lectura: sin escaneos nuevos</span>
            ) : cancelAtDate ? (
              <span className="badge b-warm">Cancelada: activa hasta el {cancelAtDate}</span>
            ) : trialDaysLeft !== null ? (
              <span className="badge b-blue">En prueba</span>
            ) : null}
          </div>
          <div className="pf-name">{current.name}</div>
          <p className="pf-tag">{current.tagline}</p>
          {current.priceLabel ? (
            <div className="pf-price">
              <b className="pf-pt">{current.priceLabel}</b>
            </div>
          ) : (
            <div className="pf-price">
              <b className="num">
                {shownPromo?.price ?? current.price}
                <small>€</small>
              </b>
              <span className="per">/{current.period}</span>
              {shownPromo ? (
                <s className="num">
                  {current.price} €
                </s>
              ) : null}
            </div>
          )}
          {activePromo && (
            <p className="pf-fp">
              Precio fundador <b>para siempre</b>, mientras mantengas tu suscripción.
            </p>
          )}
          {offeredPromoPrice !== null && (
            /* Futuro, no presente: quien lee esto todavía no paga nada. El
               descuento es el cupón `forever` de Stripe (FOUNDER-PRICE-1),
               y sólo se ofrece mientras queden plazas. */
            <p className="pf-fp">
              Precio fundador si contratas ahora, <b>para siempre</b>, mientras queden plazas.
            </p>
          )}
          {trialDaysLeft !== null && (
            <div className="pf-trial">
              <div className="h">
                <span>
                  Te quedan <b className="num">{trialDaysLeft} {trialDaysLeft === 1 ? "día" : "días"}</b> de tu prueba de 7.
                  Después, tu cuenta pasa a solo lectura si no contratas antes.
                </span>
              </div>
              <div
                className="pf-days"
                role="img"
                aria-label={`Día ${Math.min(7, Math.max(0, 7 - trialDaysLeft))} de 7`}
              >
                {Array.from({ length: 7 }, (_, i) => (
                  <i key={i} className={i < 7 - trialDaysLeft ? "on" : ""}>
                    <span className="num">{i + 1}</span>
                  </i>
                ))}
              </div>
            </div>
          )}
          {portalError && <p className="feedback error">{portalError}</p>}
          <div className="pf-acts">
            {cancelAtDate ? (
              <button type="button" className="btn blue" disabled={isPortalPending} onClick={handleManageBilling}>
                {isPortalPending ? "Abriendo…" : "Reactivar suscripción"}
              </button>
            ) : (
              <>
                {trialDaysLeft !== null ? (
                  <button type="button" className="btn blue" onClick={() => setModal({ initialTargetId: "pro" })}>
                    Contratar ahora
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`btn ${trialDaysLeft !== null ? "line" : "blue"}`}
                  onClick={() => setModal({})}
                >
                  {planId === "free" ? "Elegir plan" : "Cambiar de plan"}
                </button>
                {/* The route to invoices and payment method (founder, 2026-08-06):
                    shown to any account with a Stripe customer. */}
                {usage.hasStripeCustomer && (
                  <button type="button" className="btn ghost" disabled={isPortalPending} onClick={handleManageBilling}>
                    <Ic n="c-card" sm />
                    {isPortalPending ? "Abriendo…" : "Facturas y pago"}
                  </button>
                )}
              </>
            )}
          </div>
          {cancelAtDate && (
            <p className="pf-fp pf-cancel">
              Mantienes acceso a {current.name} hasta el <b>{cancelAtDate}</b>; después tu cuenta pasará a solo lectura.
              ¿Cambiaste de idea? Puedes reactivarla en el portal de Stripe.
            </p>
          )}
        </div>
        <div className="pf-pr">
          <div className="eyebrow bare">{planId === "free" ? "Lo que tenías" : "Incluido"}</div>
          <ul>
            {current.highlights.map((highlight) => (
              <li key={highlight}>
                <Ic n="check" sm />
                {highlight}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="sec">
        <div className="eyebrow">Uso de este ciclo</div>
        <div className="pf-uses">
          <UsageRow label="Prompts monitorizados" value={usage.promptCount} cap={usage.promptCap} />
          <UsageRow label="Dominios" value={usage.projectCount} cap={usage.projectCap} />
        </div>
      </section>

      <section className="sec">
        <div className="eyebrow">Más opciones</div>
        <div className="pf-list">
          {/* Not shown to an account already on Agencia: it would pitch the plan
              they already have (founder, 2026-08-06). The comparison lives on
              the public pricing page, so it navigates there (2026-08-25). */}
          {planId !== agencyPlanId && (
            <div className="pf-row">
              <div className="l">
                <b>¿Gestionas varios clientes?</b>
                <span>El plan {agencyPlan.name}, a medida: dominios y prompts ajustados a tu cartera.</span>
              </div>
              <div className="c">
                <Link className="btn sm line" href="/precios">
                  Comparar planes
                  <Ic n="arrowr" sm />
                </Link>
              </div>
            </div>
          )}
          <div className="pf-row">
            <div className="l">
              <b>Programa de afiliados</b>
              <span>Gana el 30 % de cada Pro que traigas, durante 12 meses.</span>
            </div>
            <div className="c">
              <Link className="btn sm line" href="/afiliados">
                Ver cómo funciona
              </Link>
            </div>
          </div>
          {usage.hasStripeSubscription && !cancelAtDate && (
            <div className="pf-row">
              <div className="l">
                <b>Cancelar suscripción</b>
                <span>Se gestiona en el portal seguro de pago.</span>
              </div>
              <div className="c">
                <button type="button" className="btn sm ghost" disabled={isPortalPending} onClick={handleCancelSubscription}>
                  {isPortalPending ? "Abriendo…" : "Cancelar suscripción"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {modal && (
        <ChangePlanModal
          currentId={planId}
          initialTargetId={modal.initialTargetId}
          overageOnly={modal.overageOnly}
          hasRealSubscription={usage.hasStripeSubscription}
          activeProjects={projects}
          promoPlanIds={promoPlanIds}
          onClose={() => setModal(null)}
          onApply={applyChange}
          onCheckout={createCheckoutSession}
          onManageBilling={createPortalSession}
        />
      )}
    </>
  );
}
