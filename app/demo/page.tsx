import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/marketing/public-header";
import { BrandLogo } from "@/components/ui/brand-logo";
import { PaymentBadgesRow } from "@/components/marketing/payment-badges";
import { DemoBooking } from "@/components/demo/demo-booking";
import { contentMetadata } from "@/lib/seo/metadata";
import "./demo.css";

/**
 * DEMO-CALL-1 — «Agenda una videollamada de 20 min con el equipo de GenScore».
 *
 * Design approved by the founder on 2026-10-10
 * (`docs/design-reference/demo-affiliates-1/`). The registration stays the
 * main call to action everywhere; this page is for whoever would not buy
 * without talking to someone first, agencies above all.
 *
 * The visitor picks a slot and the request reaches the operator by email
 * (`lib/demo/`): it is a request, not a booking, and every line here says so.
 */
export const metadata: Metadata = contentMetadata({
  title: "Agenda una videollamada con GenScore",
  description:
    "Una videollamada de 20 minutos con el equipo de GenScore: qué responden ChatGPT, Gemini y Claude sobre tu sector, a quién recomiendan en tu lugar y qué plan encaja contigo.",
  path: "/demo"
});

const POINTS = [
  "Qué responden ChatGPT, Gemini y Claude a las preguntas principales de búsqueda de tu sector.",
  "Si te nombran, a quién recomiendan en tu lugar y por qué.",
  "Qué plan encaja contigo, también si eres agencia y llevas varias marcas."
];

export default function DemoPage() {
  return (
    <div className="lp">
      <PublicHeader activeHref="/demo" />

      <main className="dm-page">
        <div className="dm-inner">
          <div className="dm-copy">
            <p className="dm-eyebrow">Videollamada · 20 minutos</p>
            <h1 className="dm-title">Te enseñamos qué dice la IA de tu marca</h1>
            <p className="dm-lede">
              Una videollamada corta con el equipo de GenScore. Traes tu web y, si quieres, la de un competidor.
            </p>
            <ul className="dm-list">
              {POINTS.map((point) => (
                <li key={point}>
                  <span className="dm-check" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 20 20">
                      <path d="M4 10.5 L8 14 L16 6" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <p className="dm-alt">
              ¿Sin tiempo para una llamada? <Link href="/gratis/informe-geo?desde=demo">Pide el informe gratis</Link> o{" "}
              <Link href="/signup">prueba 7 días de Pro</Link>.
            </p>
          </div>
          <DemoBooking />
        </div>
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
              <Link href="/blog">Blog</Link>
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
