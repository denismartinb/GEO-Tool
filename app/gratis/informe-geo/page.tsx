import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PublicHeader } from "@/components/marketing/public-header";
import { BrandLogo } from "@/components/ui/brand-logo";
import { PaymentBadgesRow } from "@/components/marketing/payment-badges";
import { FaqPageSchema } from "@/components/seo/faq-page-schema";
import { FreeReportForm } from "@/components/free-report/free-report-form";
import { contentMetadata } from "@/lib/seo/metadata";

/**
 * FREE-REPORT-1 Fase 1 — «Pide tu informe GEO gratis».
 *
 * The paid-ads and outreach hook: a branded multi-engine report, delivered by
 * hand in 48 working hours. Design approved by the founder on 2026-10-09
 * (`docs/design-reference/free-report-1/`, log §249).
 *
 * Copy rules this page must keep (founder, 2026-10-09; `.claude/rules/
 * growth-content.md`): no absolute counts of questions, answers or passes;
 * the question set is always «preguntas principales de búsqueda»; engines are
 * named without versions; delivery is «en 48 h laborables», never instant.
 *
 * Lives under `/gratis/` so the middleware matcher already skips it — the
 * page reads no session (`middleware.ts`, VERCEL-COST-1 Fase 3-b).
 */
export const metadata: Metadata = contentMetadata({
  title: "Pide tu informe GEO gratis: qué dice la IA de tu marca — GenScore",
  description:
    "Te enviamos un informe de tu marca en ChatGPT, Gemini y Claude: en qué preguntas apareces, a quién recomiendan en tu lugar, qué fuentes citan y qué cambiar primero. Gratis, en 48 h laborables.",
  path: "/gratis/informe-geo"
});

const INCLUDES = [
  {
    title: "Tu presencia, motor a motor",
    body: "Con qué frecuencia te nombra cada IA cuando alguien busca lo que vendes.",
    icon: <path d="M6 26 V16 M14 26 V8 M22 26 V12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  },
  {
    title: "El mapa de preguntas",
    body: "Las preguntas principales de búsqueda de tu sector, y en cuáles apareces y en cuáles no.",
    icon: (
      <>
        <rect x="5" y="5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="2.4" fill="none" />
        <rect x="18" y="5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="2.4" fill="none" />
        <rect x="5" y="18" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="2.4" fill="none" />
        <rect x="18" y="18" width="9" height="9" rx="2" fill="#09c5d6" />
      </>
    )
  },
  {
    title: "Quién sale en tu lugar",
    body: "Los competidores que la IA recomienda cuando no te nombra a ti, y cómo los describe.",
    icon: (
      <>
        <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2.4" fill="none" />
        <circle cx="22" cy="14" r="4" stroke="currentColor" strokeWidth="2.4" fill="none" />
        <path
          d="M3 27 C4 21 8 19 12 19 C16 19 20 21 21 27 M19 21 C21 20 27 20 29 27"
          stroke="currentColor"
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
        />
      </>
    )
  },
  {
    title: "Las fuentes que cita",
    body: "Qué webs, directorios y medios usa la IA para responder, y si alguna es tuya.",
    icon: (
      <path
        d="M13 19 L19 13 M11 15 L8 18 A4.5 4.5 0 0 0 14 24 L17 21 M15 11 L18 8 A4.5 4.5 0 0 1 24 14 L21 17"
        stroke="currentColor"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
      />
    )
  },
  {
    title: "Tu web, por dentro",
    body: "Si los asistentes pueden leer tu web, comparada con la de tu competidor más visible.",
    icon: (
      <>
        <rect x="4" y="6" width="24" height="18" rx="3" stroke="currentColor" strokeWidth="2.4" fill="none" />
        <path
          d="M10 28 H22 M9 15 L12 18 L9 21 M15 21 H21"
          stroke="currentColor"
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    )
  },
  {
    title: "Tres acciones para empezar",
    body: "Qué cambiar primero, sacado de tus datos, no de una plantilla genérica.",
    icon: (
      <>
        <path d="M7 9 H25 M7 16 H25 M7 23 H17" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="24" cy="23" r="3" fill="#ffb020" />
      </>
    )
  }
];

const STEPS = [
  {
    title: "Nos dices tu web y lo que vendes",
    body: "Con eso elegimos las preguntas principales de búsqueda que haría tu cliente."
  },
  {
    title: "Se las hacemos a ChatGPT, Gemini y Claude",
    body: "Múltiples veces, en distintos momentos, y anotamos a quién nombra y qué cita."
  },
  {
    title: "Una persona lo revisa y te lo enviamos",
    body: "Recibes el PDF en tu correo en 48 h laborables."
  }
];

const FAQ_ITEMS = [
  {
    question: "¿Es gratis de verdad?",
    answer: "Sí. Sin tarjeta y sin compromiso. Si después quieres medirlo cada semana, eso ya es GenScore."
  },
  {
    question: "¿Por qué tarda 48 h?",
    answer:
      "Porque no es una foto de un instante: repetimos las búsquedas en distintos momentos para que el resultado no dependa de una respuesta suelta. Y después una persona revisa cada informe antes de enviarlo."
  },
  {
    question: "Soy agencia, ¿puedo pedirlo de un cliente?",
    answer: "Sí, pon la web del cliente. Un informe por dominio."
  },
  {
    question: "¿Qué hacéis con mis datos?",
    answer:
      "Los tratamos según nuestra política de privacidad. Puedes darte de baja o pedirnos que los borremos cuando quieras."
  }
];

export default function FreeReportPage() {
  return (
    <div className="lp">
      <PublicHeader activeHref="/gratis/informe-geo" />
      <FaqPageSchema items={FAQ_ITEMS} />

      <main>
        <FreeReportForm>
          <section className="fr-section">
            <div className="lp-inner">
              <h2 className="fr-h2">Qué incluye tu informe</h2>
              <p className="fr-sub">Ocho páginas con datos reales de tu marca, medidos en ChatGPT, Gemini y Claude.</p>
              <div className="fr-incl">
                {INCLUDES.map((item) => (
                  <div className="fr-card" key={item.title}>
                    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
                      {item.icon}
                    </svg>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="fr-section fr-section--tight">
            <div className="lp-inner">
              <div className="fr-how">
                <figure className="fr-cover">
                  <Image
                    src="/informe-gratis/portada-ejemplo.webp"
                    alt="Portada de un informe GenScore de ejemplo: presencia de la marca en Gemini, ChatGPT y Claude, y porcentaje de respuestas que la nombran"
                    width={794}
                    height={1123}
                    sizes="(max-width: 700px) 80vw, 380px"
                  />
                  <figcaption>Portada de un informe real, con la marca anonimizada.</figcaption>
                </figure>
                <div className="fr-how-copy">
                  <h2 className="fr-h2">Cómo lo hacemos</h2>
                  <ol className="fr-steps">
                    {STEPS.map((step, index) => (
                      <li key={step.title}>
                        <span className="fr-step-n">{index + 1}</span>
                        <div>
                          <strong>{step.title}</strong>
                          <span>{step.body}</span>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          </section>

          <section className="fr-section fr-section--faq">
            <div className="lp-inner fr-faq-inner">
              <h2 className="fr-h2">Preguntas frecuentes</h2>
              <dl className="fr-faq">
                {FAQ_ITEMS.map((item) => (
                  <div key={item.question}>
                    <dt>{item.question}</dt>
                    <dd>
                      {item.question === "¿Qué hacéis con mis datos?" ? (
                        <>
                          Los tratamos según nuestra <Link href="/privacidad">política de privacidad</Link>. Puedes
                          darte de baja o pedirnos que los borremos cuando quieras.
                        </>
                      ) : (
                        item.answer
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        </FreeReportForm>
      </main>

      <footer className="lp-footer">
        <div className="lp-inner">
          <div className="row1">
            <Link href="/" className="lp-logo">
              <BrandLogo size={19} />
            </Link>
            <nav className="links" aria-label="Pie de página">
              <Link href="/#producto">Producto</Link>
              <Link href="/pricing">Precios</Link>
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
