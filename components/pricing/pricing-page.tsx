import { Fragment } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { BrandLogo } from "@/components/ui/brand-logo";
import { PublicHeader } from "@/components/marketing/public-header";
import { MARKETING_CONTENT_LINKS, MARKETING_ENTITY_LINKS } from "@/components/marketing-content-links";
import { PaymentBadgesRow } from "@/components/marketing/payment-badges";
import { PricingFaq } from "@/components/pricing/pricing-faq";
import { supportMailto } from "@/lib/support";
import { PLANS, PLAN_MATRIX, PROMO_DURATION_MONTHS, type Plan, type PlanCell } from "@/app/pricing/plans-data";
import { getActivePromoPlanIds } from "@/lib/stripe";


function PlanCard({ plan, promoActive }: { plan: Plan; promoActive: boolean }) {
  const isRec = !!plan.recommended;
  const ctaClass = "btn btn-" + (plan.ctaStyle === "primary" ? "primary" : "ghost") + " btn-lg price-cta";
  const showPromo = promoActive && plan.promoPrice !== undefined;

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
            <span className="price-was">{plan.price}&nbsp;€</span>
            <span className="price-amount">{plan.promoPrice}&nbsp;€</span>
            <span className="price-per">/{plan.period}</span>
            {/* La duración baja a su propia línea. Iba pegada como "· 6 meses"
                y partía entre el "6" y "meses" en la tarjeta recomendada, que
                es la más estrecha por su galón (fundador, 2026-08-27). Una
                línea propia no depende del ancho; forzar `nowrap` en la misma
                sólo cambia el corte por un desbordamiento. */}
            <span className="price-term">durante {PROMO_DURATION_MONTHS} meses</span>
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
        <Link className={ctaClass} href={`/signup?plan=${plan.id}`}>
          {plan.cta}
          {plan.ctaStyle === "primary" ? <Icon name="arrRight" size={15} /> : null}
        </Link>
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

function PlanMatrix({ promoActive }: { promoActive: boolean }) {
  return (
    <div className="price-matrix-outer">
      <p className="price-matrix-hint">Desliza para ver los 4 planes →</p>
      <div className="price-matrix-wrap">
      <table className="price-matrix">
        <thead>
          <tr>
            <th className="price-mx-rowhead" />
            {PLANS.map((p) => {
              const showPromo = promoActive && p.promoPrice !== undefined;
              return (
                <th key={p.id} className={p.recommended ? "price-rec" : ""}>
                  <div className="price-mx-planname">{p.name}</div>
                  <div className="price-mx-planprice">
                    {showPromo ? (
                      <>
                        <span className="price-mx-was">{p.price}&nbsp;€</span> {p.promoPrice}&nbsp;€
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
                <td colSpan={PLANS.length + 1}>{grp.group}</td>
              </tr>
              {grp.rows.map((r) => (
                <tr key={r.label} className="hoverable">
                  <td className="price-mx-rowhead">{r.label}</td>
                  {r.vals.map((v, j) => (
                    <td key={PLANS[j].id} className={"price-mx-cell" + (PLANS[j].recommended ? " price-rec" : "")}>
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
 * `/pricing` es un **componente de servidor** (PRELAUNCH-HARDENING-1 Fase V,
 * V4), mismo caso que la landing: era cliente entera por el acordeón de
 * preguntas, que ahora vive aislado en `PricingFaq`.
 *
 * De paso, el logo deja de ser un `<div onClick>` con `cursor: pointer`. Eso
 * no era un enlace: no se podía abrir en otra pestaña, no salía el destino al
 * pasar por encima y el teclado no lo alcanzaba.
 */
export function PricingPage() {
  // PRICING-PROMO-1: mismas dos condiciones que getPromoCouponIdForPlan usa
  // en el checkout real (app/dashboard/settings/billing/actions.ts) — fecha
  // Y cupón de Stripe configurado. Si falta el cupón, esta pantalla no
  // muestra ningún tachado, aunque la fecha lo permita.
  const promoActive = getActivePromoPlanIds().length > 0;

  return (
    <div className="lp">
      {/* HOME-SEO-AUDIT-1 (fundador, 2026-08-25): se retira este banner
          propio de `/pricing`. Desde PROMO-EVERYWHERE-1 (log §30 más abajo,
          §159 en el mapa de zonas de CLAUDE.md) `PublicHeader` ya monta la
          tira de promoción común (`.lp-promo`) en TODAS las superficies
          públicas, incluida ésta. Con el cupón de Stripe real configurado en
          el entorno, las dos se pintaban a la vez sobre `/pricing` — la común
          y ésta, ambas anunciando el mismo descuento con textos distintos.
          El fundador la vio duplicada en el preview y pidió quitar ésta,
          quedándose con la común (`docs/brand/design-decisions-log.md` §31,
          "importante mantener la tira comun en /precios"). */}

      {/* NAV */}
      <PublicHeader activeHref="/pricing" />

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
            <span><Icon name="check" size={14} className="text-[var(--pos)]" />Primer escaneo gratis</span>
            <span><Icon name="check" size={14} className="text-[var(--pos)]" />Sin tarjeta</span>
            <span><Icon name="check" size={14} className="text-[var(--pos)]" />Cancela cuando quieras</span>
          </div>
        </div>
      </header>

      <main>
      {/* CARDS */}
      <section className="lp-section" style={{ paddingTop: 8 }}>
        <div className="lp-inner">
          <div className="price-cards">
            {PLANS.map((p) => (
              <PlanCard key={p.id} plan={p} promoActive={promoActive} />
            ))}
          </div>
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
          <PlanMatrix promoActive={promoActive} />
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
              <h2>Empieza con un escaneo gratis</h2>
              <p>Mira tu GEO Score y tus 3 primeras acciones en minutos. Sin tarjeta.</p>
              <div className="row">
                <Link className="btn btn-white btn-lg" href="/signup?plan=free">
                  Escanear gratis <Icon name="arrRight" size={16} />
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
              <Link href="/pricing">Precios</Link>
              {MARKETING_CONTENT_LINKS.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
              {MARKETING_ENTITY_LINKS.map((l) => (
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
