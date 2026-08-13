import { Fragment } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { BrandLogo } from "@/components/ui/brand-logo";
import { PublicHeader } from "@/components/marketing/public-header";
import { MARKETING_CONTENT_LINKS } from "@/components/marketing-content-links";
import { PricingFaq } from "@/components/pricing/pricing-faq";
import { supportMailto } from "@/lib/support";
import { PLANS, PLAN_MATRIX, type Plan, type PlanCell } from "@/app/pricing/plans-data";

const METER_ITEMS: Array<{ icon: string; t: string; d: string; scale: string[] }> = [
  { icon: "prompts", t: "Prompts", d: "Cuántas preguntas monitorizamos en tu mercado, de 10 a 300.", scale: ["10", "25", "100", "300"] },
  { icon: "layers", t: "Motores", d: "Gemini, Claude y ChatGPT hoy — sumamos más motores de IA sin coste extra según se publiquen.", scale: ["1", "3", "3", "3"] },
  { icon: "refresh", t: "Frecuencia", d: "De un escaneo puntual a refresco diario con tendencia y alertas.", scale: ["Puntual", "Semanal", "Diario", "Diario"] }
];

function PlanCard({ plan }: { plan: Plan }) {
  const isRec = !!plan.recommended;
  const ctaClass = "btn btn-" + (plan.ctaStyle === "primary" ? "primary" : "ghost") + " btn-lg price-cta";

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

function PlanMatrix() {
  return (
    <div className="price-matrix-outer">
      <p className="price-matrix-hint">Desliza para ver los 4 planes →</p>
      <div className="price-matrix-wrap">
      <table className="price-matrix">
        <thead>
          <tr>
            <th className="price-mx-rowhead" />
            {PLANS.map((p) => (
              <th key={p.id} className={p.recommended ? "price-rec" : ""}>
                <div className="price-mx-planname">{p.name}</div>
                <div className="price-mx-planprice">
                  {p.priceLabel ?? (p.price === 0 ? "0 €" : p.price + " €")}
                  <span>{p.priceLabel || p.price === 0 ? "" : "/mes"}</span>
                </div>
              </th>
            ))}
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
  return (
    <div className="lp">
      {/* NAV */}
      <div className="lp-nav-wrap">
        <PublicHeader activeHref="/pricing" />
      </div>

      {/* HERO */}
      <header className="lp-hero price-hero">
        <div className="onb-aurora">
          <div className="ring" /><div className="ring r2" />
          <div className="blob blob-2" /><div className="blob blob-3" />
        </div>
        <div className="lp-hero-content">
          <span className="lp-eyebrow"><Icon name="card" size={14} />Precios mid-market · facturación mensual</span>
          <h1 className="lp-h1" style={{ fontSize: 52 }}>
            Paga por <span className="grad">valor</span>,<br />no por usuarios
          </h1>
          <p className="lp-lead">
            Usuarios ilimitados en todos los planes. Mides por prompts, motores y frecuencia de refresco —
            y conviertes cada dato en acción. Empieza con un escaneo gratis.
          </p>
          <div className="lp-hero-note" style={{ marginTop: 22 }}>
            <span><Icon name="check" size={14} className="text-[var(--pos)]" />Sin tarjeta para empezar</span>
            <span><Icon name="check" size={14} className="text-[var(--pos)]" />Usuarios ilimitados</span>
            <span><Icon name="check" size={14} className="text-[var(--pos)]" />Cancela cuando quieras</span>
          </div>
        </div>
      </header>

      {/* CARDS */}
      <section className="lp-section" style={{ paddingTop: 8 }}>
        <div className="lp-inner">
          <div className="price-cards">
            {PLANS.map((p) => (
              <PlanCard key={p.id} plan={p} />
            ))}
          </div>
        </div>
      </section>

      {/* METERING EXPLAINER */}
      <section className="lp-section alt" style={{ padding: "64px 0" }}>
        <div className="lp-inner">
          <div className="price-meter-head">
            <div className="lp-kicker">Cómo medimos</div>
            <h2 className="lp-h2" style={{ fontSize: 30, marginTop: 10 }}>Tres palancas, una factura honesta</h2>
            <p className="lp-sec-sub" style={{ margin: "12px 0 0" }}>Tu plan se define por estas tres variables. Sin costes ocultos por usuario.</p>
          </div>
          <div className="price-meter-grid">
            {METER_ITEMS.map((m) => (
              <div className="price-meter-card" key={m.t}>
                <div className="price-meter-ic"><Icon name={m.icon} size={20} /></div>
                <div className="price-meter-t">{m.t}</div>
                <div className="price-meter-d">{m.d}</div>
                <div className="price-meter-scale">
                  {m.scale.map((s, i) => (
                    <span key={i} className={i === m.scale.length - 1 ? "top" : ""}>{s}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MATRIX */}
      <section className="lp-section">
        <div className="lp-inner">
          <div className="lp-sec-head" style={{ marginBottom: 36 }}>
            <div className="lp-kicker">Comparativa</div>
            <h2 className="lp-h2">Todo lo que incluye cada plan</h2>
            <p className="lp-sec-sub">
              Las palancas de upsell son la cobertura de motores y la frecuencia de refresco — como en el resto del
              mercado, pero con el bucle de acción que solo tiene GenScore.
            </p>
          </div>
          <PlanMatrix />
        </div>
      </section>

      {/* VALUE ANCHOR */}
      <section className="lp-section alt" style={{ padding: "60px 0" }}>
        <div className="lp-inner">
          <div className="price-anchor">
            <div className="price-anchor-ic"><Icon name="target" size={22} /></div>
            <div>
              <div className="price-anchor-t">El precio se ancla en el tiempo de analista que te ahorras</div>
              <p className="price-anchor-d">
                Otras herramientas te entregan datos y te dejan el trabajo de priorizar. GenScore prioriza por ti —con
                evidencia, impacto y soluciones listas para implementar—. Eso es lo que justifica situarse en la
                parte media-alta de la banda del mercado, no «otra herramienta de tracking».
              </p>
            </div>
          </div>
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

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-inner">
          <div className="row1">
            <Link className="lp-logo" href="/" aria-label="Inicio de GenScore">
              <BrandLogo size={19} />
            </Link>
            <div className="links">
              <Link href="/#producto">Producto</Link>
              <Link href="/#como">Cómo funciona</Link>
              <Link href="/pricing">Precios</Link>
              {MARKETING_CONTENT_LINKS.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
              <Link href="/privacidad">Privacidad</Link>
              <Link href="/cookies">Cookies</Link>
              <Link href="/terminos">Términos</Link>
            </div>
          </div>
          <div className="copy">© 2026 GenScore · Generative Engine Optimization para empresas y agencias.</div>
        </div>
      </footer>
    </div>
  );
}
