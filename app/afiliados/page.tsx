import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/marketing/public-header";
import { BrandLogo } from "@/components/ui/brand-logo";
import { PaymentBadgesRow } from "@/components/marketing/payment-badges";
import {
  MARKETING_CONTENT_LINKS,
  MARKETING_ENTITY_LINKS,
  MARKETING_LEAD_LINKS
} from "@/components/marketing-content-links";
import { AffiliateForm } from "@/components/affiliates/affiliate-form";
import { PLANS } from "@/app/pricing/plans-data";
import { contentMetadata } from "@/lib/seo/metadata";
import {
  AFFILIATE_COMMISSION_MONTHS,
  AFFILIATE_COOKIE_DAYS,
  AFFILIATE_PAYOUT_MIN_EUR,
  AFFILIATE_PLAN_ID,
  exampleMonthlyCommissionEur,
  formatCommissionRate
} from "@/lib/affiliates/terms";
import "./afiliados.css";

/**
 * AFFILIATES-1 — «Programa de afiliados».
 *
 * Design approved by the founder on 2026-10-10 (demo-afiliados, «Cambio 3»).
 * Every figure on the page comes from `lib/affiliates/terms.ts` and the
 * example from the Pro plan in `plans-data.ts`, so the page cannot promise
 * what the monthly report (`lib/affiliates/report.ts`) does not pay. No
 * absolute counts of users or answers anywhere (founder rule for public copy).
 *
 * Static and session-free: the middleware matcher skips `/afiliados` except
 * when the URL carries `?ref=` (`middleware.ts`).
 */
export const metadata: Metadata = contentMetadata({
  title: "Programa de afiliados de GenScore: 30 % durante 12 meses",
  description:
    "Recomienda GenScore y cobra el 30 % de cada pago de Pro durante 12 meses. Para agencias, consultores SEO y creadores que hablan de búsqueda e IA.",
  path: "/afiliados"
});

const pro = PLANS.find((plan) => plan.id === AFFILIATE_PLAN_ID);
// The founder price while it is on offer; the normal price otherwise.
const exampleGross = pro?.promoPrice ?? pro?.price ?? 0;
const exampleIsFounderPrice = pro?.promoPrice !== undefined;
const exampleCommission = exampleMonthlyCommissionEur(exampleGross);
const rate = formatCommissionRate();

const STEPS = [
  {
    title: "Te damos tu enlace",
    body: "Revisamos tu solicitud y te mandamos un enlace propio a genscore.es."
  },
  {
    title: "Alguien se da de alta",
    body: "Prueba Pro 7 días gratis. Si contrata Pro, la cuenta queda asociada a ti."
  },
  {
    title: "Cobras cada mes",
    body: "El día 5 te enviamos el detalle y te pagamos por transferencia lo cobrado el mes anterior."
  }
];

const CONDITIONS = [
  "Sólo cuentan las cuentas Pro con pago real. La prueba gratuita, los reembolsos y las devoluciones no generan comisión.",
  "La comisión se calcula sobre lo cobrado sin IVA, después de descuentos.",
  `Pago a partir de ${AFFILIATE_PAYOUT_MIN_EUR} € acumulados, con factura del afiliado.`
];

export default function AffiliatesPage() {
  return (
    <div className="lp">
      <PublicHeader activeHref="/afiliados" />

      <main>
        <section className="af-hero">
          <div className="af-inner">
            <p className="af-eyebrow">Programa de afiliados</p>
            <h1 className="af-title">Recomienda GenScore y cobra cada mes</h1>
            <p className="af-lede">
              Para agencias, consultores SEO y creadores que hablan de búsqueda e IA. Tú recomiendas; nosotros nos
              ocupamos de la prueba, el producto y el soporte.
            </p>
            <dl className="af-big">
              <div>
                <dt>{rate}</dt>
                <dd>de cada pago de Pro</dd>
              </div>
              <div>
                <dt>{AFFILIATE_COMMISSION_MONTHS} meses</dt>
                <dd>por cada cuenta que traigas</dd>
              </div>
              <div>
                <dt>{AFFILIATE_COOKIE_DAYS} días</dt>
                <dd>de validez de tu enlace</dd>
              </div>
            </dl>
            <AffiliateForm />
          </div>
        </section>

        <section className="af-section" aria-labelledby="af-how">
          <div className="af-inner">
            <h2 className="af-h2" id="af-how">
              Cómo funciona
            </h2>
            <ol className="af-steps">
              {STEPS.map((step, index) => (
                <li className="af-step" key={step.title}>
                  <span className="af-step-n">Paso {index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>

            <p className="af-example">
              <strong>Ejemplo:</strong> una cuenta Pro{exampleIsFounderPrice ? " a precio fundador" : ""} paga{" "}
              {exampleGross} € al mes con IVA. Tu comisión es el {rate} de la base sin IVA, unos {exampleCommission} € al
              mes durante {AFFILIATE_COMMISSION_MONTHS} meses.
            </p>

            <div className="af-rules">
              <h2 className="af-h3">Condiciones</h2>
              <ul>
                {CONDITIONS.map((condition) => (
                  <li key={condition}>{condition}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-inner">
          <div className="row1">
            <Link href="/" className="lp-logo">
              <BrandLogo size={19} />
            </Link>
            <nav className="links" aria-label="Pie de página">
              <Link href="/#producto">Producto</Link>
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
