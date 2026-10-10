import { Fragment } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { BrandLogo } from "@/components/ui/brand-logo";
import { PublicHeader } from "@/components/marketing/public-header";
import { MARKETING_CONTENT_LINKS, MARKETING_ENTITY_LINKS, MARKETING_LEAD_LINKS } from "@/components/marketing-content-links";
import { PaymentBadgesRow } from "@/components/marketing/payment-badges";
import { FreeReportPriceLine } from "@/components/free-report/free-report-offers";
import { PricingFaq } from "@/components/pricing/pricing-faq";
import { PlanCardCta } from "@/components/pricing/plan-card-cta";
import { supportMailto } from "@/lib/support";
import { SELLABLE_PLANS, PLAN_MATRIX, type Plan, type PlanCell } from "@/app/pricing/plans-data";
import { getFounderOffer } from "@/lib/stripe";


function PlanCard({ plan, promoPlanIds }: { plan: Plan; promoPlanIds: readonly string[] }) {
  const isRec = !!plan.recommended;
  const ctaClass = "btn btn-" + (plan.ctaStyle === "primary" ? "primary" : "ghost") + " btn-lg price-cta";
  const showPromo = promoPlanIds.includes(plan.id) && plan.promoPrice !== undefined;

  return (
    <div className={"price-card" + (isRec ? " price-rec" : "")}>
      {isRec ? (
        <div className="price-ribbon">
          <Icon name="spark" size={12} />
          Recomendado
        </div>
      ) : null}
      <div className="price-card-head">
        <div className="price-name">{plan.name}</div>
        <div className="price-tag">{plan.tagline}</div>
      </div>
      <div className="price-price">
        {plan.priceLabel ? (
          <span className="price-amount">{plan.priceLabel}</span>
        ) : plan.price === 0 ? (
          <span className="price-amount">0&nbsp;€</span>
        ) : showPromo ? (
          <>
            {/* FOUNDER-PRICE-1 (log §237): sin precio tachado. El tachado de
                PRICING-PROMO-1 (179 → 59) se leía como precio inflado; ahora
                el precio normal es real y se dice en palabras, en su propia
                línea por la misma razón que la duración antes (fundador,
                2026-08-27: partía en la tarjeta recomendada). */}
            {/* Tachado de vuelta (fundador, 2026-10-09, log §243): el precio
                normal se tacha mientras el cupón fundador exista y queden
                plazas. Es el precio real sin descuento, no uno inflado. */}
            <span className="price-was">{plan.price}&nbsp;€</span>
            <span className="price-amount">{plan.promoPrice}&nbsp;€</span>
            <span className="price-per">/{plan.period}</span>
            <span className="price-term">Precio fundador para siempre</span>
          </>
        ) : (
          <>
            <span className="price-amount">{plan.price}&nbsp;€</span>
            <span className="price-per">/{plan.period}</span>
          </>
        )}
      </div>
      <div className="price-who">{plan.who}</div>
      {plan.id === "agency" ? (
        // El plan Agencia no se contrata online — lo dice el propio producto
        // (`app/dashboard/settings/billing/actions.ts`: "Este plan no se
        // contrata online. Escríbenos a soporte@genscore.es"). Hasta ahora
        // esta tarjeta terminaba en un botón que no hacía nada, así que el
        // único plan que EXIGE hablar con alguien era el único sin forma de
        // hacerlo. Mismo destino que ya usa el modal de cambio de plan.
        <a className={ctaClass} href={supportMailto("Plan Agencia")}>
          {plan.cta}
        </a>
      ) : (
        <PlanCardCta planId={plan.id} cta={plan.cta} className={ctaClass} primary={plan.ctaStyle === "primary"} />
      )}
      <ul className="price-feats">
        {plan.highlights.map((h) => (
          <li key={h}>
            <span className="price-chk">
              <Icon name="check" size={12} />
            </span>
            {h}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MatrixCell({ v }: { v: PlanCell }) {
  if (v === true) return <span className="price-mx-yes"><Icon name="check" size={14} /></span>;
  if (v === false) return <span className="price-mx-no">—</span>;
  return <span className="price-mx-txt">{v}</span>;
}

function PlanMatrix({ promoPlanIds }: { promoPlanIds: readonly string[] }) {
  return (
    <div className="price-matrix-outer">
      <p className="price-matrix-hint">Desliza para ver los 3 planes →</p>
      <div className="price-matrix-wrap">
      <table className="price-matrix">
        <thead>
          <tr>
            <th className="price-mx-rowhead" />
            {SELLABLE_PLANS.map((p) => {
              const showPromo = promoPlanIds.includes(p.id) && p.promoPrice !== undefined;
              return (
                <th key={p.id} className={p.recommended ? "price-rec" : ""}>
                  <div className="price-mx-planname">{p.name}</div>
                  <div className="price-mx-planprice">
                    {showPromo ? (
                      <>
                        <s className="price-mx-was">{p.price}&nbsp;€</s> {p.promoPrice}&nbsp;€
                      </>
                    ) : (
                      p.priceLabel ?? (p.price === 0 ? "0 €" : p.price + " €")
                    )}
                    <span>{p.priceLabel || p.price === 0 ? "" : "/mes"}</span>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {PLAN_MATRIX.map((grp) => (
            <Fragment key={grp.group}>
              <tr className="price-mx-grouprow">
                <td colSpan={SELLABLE_PLANS.length + 1}>{grp.group}</td>
              </tr>
              {grp.rows.map((r) => (
                <tr key={r.label} className="hoverable">
                  <td className="price-mx-rowhead">{r.label}</td>
                  {r.vals.map((v, j) => (
                    <td key={SELLABLE_PLANS[j].id} className={"price-mx-cell" + (SELLABLE_PLANS[j].recommended ? " price-rec" : "")}>
                      <MatrixCell v={v} />
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/**
 * `/precios` es un **componente de servidor** (PRELAUNCH-HARDENING-1 Fase V,
 * V4), mismo caso que la landing: era cliente entera por el acordeón de
 * preguntas, que ahora vive aislado en `PricingFaq`.
 *
 * De paso, el logo deja de ser un `<div onClick>` con `cursor: pointer`. Eso
 * no era un enlace: no se podía abrir en otra pestaña, no salía el destino al
 * pasar por encima y el teclado no lo alcanzaba.
 */
export async function PricingPage() {
  // FOUNDER-PRICE-1: la misma lectura que usa el checkout real
  // (app/dashboard/settings/billing/actions.ts) — cupones de Stripe con la
  // forma exacta del precio mostrado y plazas libres. Si falta cualquiera de
  // las dos cosas, esta pantalla enseña sólo el precio normal.
  const founder = await getFounderOffer();
  const promoPlanIds = founder.planIds;

  return (
    <div className="lp">
      {/* HOME-SEO-AUDIT-1 (fundador, 2026-08-25): se retira este banner
          propio de `/precios`. Desde PROMO-EVERYWHERE-1 (log §30 más abajo,
          §159 en el mapa de zonas de CLAUDE.md) `PublicHeader` ya monta la
          tira de promoción común (`.lp-promo`) en TODAS las superficies
          públicas, incluida ésta. Con el cupón de Stripe real configurado en
          el entorno, las dos se pintaban a la vez sobre `/precios` — la común
          y ésta, ambas anunciando el mismo descuento con textos distintos.
          El fundador la vio duplicada en el preview y pidió quitar ésta,
          quedándose con la común (`docs/brand/design-decisions-log.md` §31,
          "importante mantener la tira comun en /precios"). */}

      {/* NAV */}
      <PublicHeader activeHref="/precios" />

      {/* HERO */}
      <header className="lp-hero price-hero">
        <div className="onb-aurora">
          <div className="ring" /><div className="ring r2" />
          <div className="blob blob-2" /><div className="blob blob-3" />
        </div>
        <div className="lp-hero-content">
          <span className="lp-eyebrow"><Icon name="card" size={14} />Planes que crecen contigo</span>
          <h1 className="lp-h1" style={{ fontSize: 52 }}>
            Paga solo por <span className="grad">lo que necesitas</span>
          </h1>
          <p className="lp-lead">
            Analiza tu presencia en IA y amplía prompts, motores y frecuencia a medida que creces.
          </p>
          <div className="lp-hero-note" style={{ marginTop: 22 }}>
            <span><Icon name="check" size={14} className="text-[var(--pos)]" />7 días de Pro gratis</span>
            <span><Icon name="check" size={14} className="text-[var(--pos)]" />Sin tarjeta</span>
            <span><Icon name="check" size={14} className="text-[var(--pos)]" />Cancela cuando quieras</span>
          </div>
        </div>
      </header>

      <main>
      {/* CARDS */}
      <section className="lp-section" style={{ paddingTop: 8 }}>
        <div className="lp-inner">
          {promoPlanIds.length > 0 ? (
            // FOUNDER-PRICE-1: la cuenta es real — `times_redeemed` de los
            // cupones de Stripe, con hasta cinco minutos de caché y una hora
            // de revalidación de la página.
            <p className="price-founder-band">
              <Icon name="spark" size={14} />
              Precio fundador para siempre: quedan <b>{founder.remaining}</b> cuentas con precio especial
            </p>
          ) : null}
          <div className="price-cards">
            {SELLABLE_PLANS.map((p) => (
              <PlanCard key={p.id} plan={p} promoPlanIds={promoPlanIds} />
            ))}
          </div>
          <p className="price-tax-note">
            Todos los planes empiezan con 7 días de Pro gratis, sin tarjeta. Precios con IVA incluido.
          </p>
          {/* FREE-REPORT-2 (log §252): one quiet line for whoever still doubts. */}
          <FreeReportPriceLine />
        </div>
      </section>

      {/* PAYMENT BADGES */}
      <section className="lp-section alt" style={{ padding: "40px 0" }}>
        <div className="lp-inner">
          <PaymentBadgesRow />
        </div>
      </section>

      {/* MATRIX */}
      <section className="lp-section">
        <div className="lp-inner">
          <div className="lp-sec-head" style={{ marginBottom: 36 }}>
            <div className="lp-kicker">Comparativa</div>
            <h2 className="lp-h2">Todo lo que incluye cada plan</h2>
          </div>
          <PlanMatrix promoPlanIds={promoPlanIds} />
        </div>
      </section>

      {/* FAQ */}
      <section className="lp-section">
        <div className="lp-inner price-faq-inner">
          <div className="lp-sec-head" style={{ marginBottom: 36 }}>
            <div className="lp-kicker">Preguntas frecuentes</div>
            <h2 className="lp-h2">Lo que suelen preguntarnos</h2>
          </div>
          <PricingFaq />
        </div>
      </section>

      {/* CTA BAND */}
      <section className="lp-section" style={{ paddingTop: 0 }}>
        <div className="lp-inner">
          <div className="lp-ctaband">
            <div className="onb-aurora" style={{ opacity: 0.25 }}><div className="blob blob-2" /><div className="blob blob-3" /></div>
            <div style={{ position: "relative", zIndex: 2 }}>
              <h2>Prueba Pro 7 días gratis</h2>
              <p>Mira tu GEO Score y tus primeras acciones en minutos. Sin tarjeta.</p>
              <div className="row">
                <Link className="btn btn-white btn-lg" href="/signup">
                  Empezar la prueba <Icon name="arrRight" size={16} />
                </Link>
                <a className="btn btn-onaccent btn-lg" href={supportMailto("Hablar con ventas")}>
                  Hablar con ventas
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
      </main>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-inner">
          <div className="row1">
            <Link className="lp-logo" href="/" aria-label="Inicio de GenScore">
              <BrandLogo size={19} />
            </Link>
            <nav className="links" aria-label="Pie de página">
              <Link href="/#producto">Producto</Link>
              <Link href="/#como">Cómo funciona</Link>
              <Link href="/precios">Precios</Link>
              {MARKETING_CONTENT_LINKS.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
              {[...MARKETING_ENTITY_LINKS, ...MARKETING_LEAD_LINKS].map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
              <Link href="/privacidad">Privacidad</Link>
              <Link href="/cookies">Cookies</Link>
              <Link href="/terminos">Términos</Link>
            </nav>
          </div>
          <div className="lp-footer-pay">
            <PaymentBadgesRow />
          </div>
          <div className="copy">© 2026 GenScore · Generative Engine Optimization para empresas y agencias.</div>
        </div>
      </footer>
    </div>
  );
}
