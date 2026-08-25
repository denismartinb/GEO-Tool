import { Fragment } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { BrandLogo } from "@/components/ui/brand-logo";
import { PublicHeader } from "@/components/marketing/public-header";
import { MARKETING_CONTENT_LINKS, MARKETING_ENTITY_LINKS } from "@/components/marketing-content-links";
import { PricingFaq } from "@/components/pricing/pricing-faq";
import { supportMailto } from "@/lib/support";
import { PLANS, PLAN_MATRIX, PROMO_ENDS_AT, type Plan, type PlanCell } from "@/app/pricing/plans-data";
import { getActivePromoPlanIds } from "@/lib/stripe";

// Marcas simplificadas (simple-icons, CC0) — cada método de pago que Stripe
// Checkout ofrece por defecto a un cliente sin restringir `payment_method_types`
// (app/dashboard/settings/billing/actions.ts). No son botones funcionales, solo
// la insignia de confianza: el pago en sí lo dispara Stripe Checkout.
const PAYMENT_BADGES: Array<{ name: string; color: string; path: string }> = [
  { name: "Stripe", color: "#635BFF", path: "M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z" },
  { name: "Apple Pay", color: "#000000", path: "M2.15 4.318a42.16 42.16 0 0 0-.454.003c-.15.005-.303.013-.452.04a1.44 1.44 0 0 0-1.06.772c-.07.138-.114.278-.14.43-.028.148-.037.3-.04.45A10.2 10.2 0 0 0 0 6.222v11.557c0 .07.002.138.003.207.004.15.013.303.04.452.027.15.072.291.142.429a1.436 1.436 0 0 0 .63.63c.138.07.278.115.43.142.148.027.3.036.45.04l.208.003h20.194l.207-.003c.15-.004.303-.013.452-.04.15-.027.291-.071.428-.141a1.432 1.432 0 0 0 .631-.631c.07-.138.115-.278.141-.43.027-.148.036-.3.04-.45.002-.07.003-.138.003-.208l.001-.246V6.221c0-.07-.002-.138-.004-.207a2.995 2.995 0 0 0-.04-.452 1.446 1.446 0 0 0-1.2-1.201 3.022 3.022 0 0 0-.452-.04 10.448 10.448 0 0 0-.453-.003zm0 .512h19.942c.066 0 .131.002.197.003.115.004.25.01.375.032.109.02.2.05.287.094a.927.927 0 0 1 .407.407.997.997 0 0 1 .094.288c.022.123.028.258.031.374.002.065.003.13.003.197v11.552c0 .065 0 .13-.003.196-.003.115-.009.25-.032.375a.927.927 0 0 1-.5.693 1.002 1.002 0 0 1-.286.094 2.598 2.598 0 0 1-.373.032l-.2.003H1.906c-.066 0-.133-.002-.196-.003a2.61 2.61 0 0 1-.375-.032c-.109-.02-.2-.05-.288-.094a.918.918 0 0 1-.406-.407 1.006 1.006 0 0 1-.094-.288 2.531 2.531 0 0 1-.032-.373 9.588 9.588 0 0 1-.002-.197V6.224c0-.065 0-.131.002-.197.004-.114.01-.248.032-.375.02-.108.05-.199.094-.287a.925.925 0 0 1 .407-.406 1.03 1.03 0 0 1 .287-.094c.125-.022.26-.029.375-.032.065-.002.131-.002.196-.003zm4.71 3.7c-.3.016-.668.199-.88.456-.191.22-.36.58-.316.918.338.03.675-.169.888-.418.205-.258.345-.603.308-.955zm2.207.42v5.493h.852v-1.877h1.18c1.078 0 1.835-.739 1.835-1.812 0-1.07-.742-1.805-1.808-1.805zm.852.719h.982c.739 0 1.161.396 1.161 1.089 0 .692-.422 1.092-1.164 1.092h-.979zm-3.154.3c-.45.01-.83.28-1.05.28-.235 0-.593-.264-.981-.257a1.446 1.446 0 0 0-1.23.747c-.527.908-.139 2.255.374 2.995.249.366.549.769.944.754.373-.014.52-.242.973-.242.454 0 .586.242.98.235.41-.007.667-.366.915-.733.286-.417.403-.82.41-.841-.007-.008-.79-.308-.797-1.209-.008-.754.615-1.113.644-1.135-.352-.52-.9-.578-1.09-.593a1.123 1.123 0 0 0-.092-.002zm8.204.397c-.99 0-1.606.533-1.652 1.256h.777c.072-.358.369-.586.845-.586.502 0 .803.266.803.711v.309l-1.097.064c-.951.054-1.488.484-1.488 1.184 0 .72.548 1.207 1.332 1.207.526 0 1.032-.281 1.264-.727h.019v.659h.788v-2.76c0-.803-.62-1.317-1.591-1.317zm1.94.072l1.446 4.009c0 .003-.073.24-.073.247-.125.41-.33.571-.711.571-.069 0-.206 0-.267-.015v.666c.06.011.267.019.335.019.83 0 1.226-.312 1.568-1.283l1.5-4.214h-.868l-1.012 3.259h-.015l-1.013-3.26zm-1.167 2.189v.316c0 .521-.45.917-1.024.917-.442 0-.731-.228-.731-.579 0-.342.278-.56.769-.593z" },
  { name: "Google Pay", color: "#3C4043", path: "M3.963 7.235A3.963 3.963 0 00.422 9.419a3.963 3.963 0 000 3.559 3.963 3.963 0 003.541 2.184c1.07 0 1.97-.352 2.627-.957.748-.69 1.18-1.71 1.18-2.916a4.722 4.722 0 00-.07-.806H3.964v1.526h2.14a1.835 1.835 0 01-.79 1.205c-.356.241-.814.379-1.35.379-1.034 0-1.911-.697-2.225-1.636a2.375 2.375 0 010-1.517c.314-.94 1.191-1.636 2.225-1.636a2.152 2.152 0 011.52.594l1.132-1.13a3.808 3.808 0 00-2.652-1.033zm6.501.55v6.9h.886V11.89h1.465c.603 0 1.11-.196 1.522-.588a1.911 1.911 0 00.635-1.464 1.92 1.92 0 00-.635-1.456 2.125 2.125 0 00-1.522-.598zm2.427.85a1.156 1.156 0 01.823.365 1.176 1.176 0 010 1.686 1.171 1.171 0 01-.877.357H11.35V8.635h1.487a1.156 1.156 0 01.054 0zm4.124 1.175c-.842 0-1.477.308-1.907.925l.781.491c.288-.417.68-.626 1.175-.626a1.255 1.255 0 01.856.323 1.009 1.009 0 01.366.785v.202c-.34-.193-.774-.289-1.3-.289-.617 0-1.11.145-1.479.434-.37.288-.554.677-.554 1.165a1.476 1.476 0 00.525 1.156c.35.308.785.463 1.305.463.61 0 1.098-.27 1.465-.81h.038v.655h.848v-2.909c0-.61-.19-1.09-.568-1.44-.38-.35-.896-.525-1.551-.525zm2.263.154l1.946 4.422-1.098 2.38h.915L24 9.963h-.965l-1.368 3.391h-.02l-1.406-3.39zm-2.146 2.368c.494 0 .88.11 1.156.33 0 .372-.147.696-.44.973a1.413 1.413 0 01-.997.414 1.081 1.081 0 01-.69-.232.708.708 0 01-.293-.578c0-.257.12-.47.363-.647.24-.173.54-.26.9-.26Z" }
];

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
            <span className="price-per">/{plan.period} · 6 meses</span>
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
  const promoEndsLabel = new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Madrid"
  }).format(new Date(PROMO_ENDS_AT));

  return (
    <div className="lp">
      {promoActive && (
        <div className="price-promo-band">
          <Icon name="spark" size={14} />
          <span>
            <b>Precio de lanzamiento</b> — Starter y Pro con descuento los 6 primeros meses. Termina el {promoEndsLabel}.
          </span>
        </div>
      )}

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
          <div className="price-pay-badges">
            <span className="price-pay-label">Pagos seguros con</span>
            <span className="price-pay-icons">
              {PAYMENT_BADGES.map((b) => (
                <span className="price-pay-icon" key={b.name} title={b.name}>
                  <svg width="22" height="22" viewBox="0 0 24 24" role="img" aria-label={b.name}>
                    <path fill={b.color} d={b.path} />
                  </svg>
                  <span>{b.name}</span>
                </span>
              ))}
            </span>
          </div>
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
          <div className="copy">© 2026 GenScore · Generative Engine Optimization para empresas y agencias.</div>
        </div>
      </footer>
    </div>
  );
}
