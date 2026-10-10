import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { FaqPageSchema } from "@/components/seo/faq-page-schema";
import { FreeCheckerForm } from "@/components/free-checker/free-checker-form";
import { ORGANIZATION_ID, SITE_ORIGIN } from "@/lib/brand/canonical-definition";
import { FREE_REPORT_ENTRY, freeReportHref } from "@/lib/free-report/promo";
import { contentMetadata } from "@/lib/seo/metadata";

const PAGE_PATH = "/gratis/aparece-mi-marca-en-chatgpt";
const PAGE_URL = `${SITE_ORIGIN}${PAGE_PATH}`;

/**
 * FREE-CHECKER-1 — el comprobador gratuito anónimo. Rehecho en GEO-SELF-1
 * Fase 5 (log §263) sobre el diseño aprobado por el fundador el 2026-10-10
 * (`docs/design-reference/geo-self-1-checker/`): portada oscura con el campo
 * dentro, un resultado de ejemplo, cómo leerlo, gratis frente a completo, FAQ
 * y tres enlaces.
 *
 * **Por qué el titular puede decir ChatGPT.** Porque la comprobación pregunta
 * a ChatGPT de verdad (`PUBLIC_CHECK_ENGINE`). Mientras el motor fue Gemini,
 * este título habría sido el mismo reclamo falso que PRICING-TRUTH-1 retiró
 * del producto; el fundador cambió el motor precisamente para que la página
 * pudiera llamarse por su nombre (2026-08-15).
 *
 * **Y por qué no canibaliza a S1.** `/blog/como-saber-si-tu-marca-aparece-en-
 * chatgpt` ya ocupa la consulta INFORMACIONAL ("cómo saber si…"). Esta página
 * ocupa la TRANSACCIONAL ("compruébalo ahora"). Se enlazan entre sí.
 *
 * **El ejemplo es inventado y lo dice.** Marcas "Competidor A/B/C" y dominios
 * genéricos, con la etiqueta "Ejemplo ilustrativo con datos inventados" encima:
 * enseña la forma del resultado, nunca un resultado (CLAUDE.md, "no fake
 * metrics"). Cada bloque del ejemplo existe en el resultado real
 * (`FreeCheckerResult`): pregunta, respuesta, marcas nombradas y fuentes.
 */
export const metadata: Metadata = contentMetadata({
  title: "¿Aparece tu marca en ChatGPT? Compruébalo gratis — GenScore",
  description:
    "Comprueba gratis y sin registro si ChatGPT nombra tu marca al responder una pregunta real de tu sector, y qué competidores recomienda en tu lugar. El escaneo completo cubre además Gemini y Claude.",
  path: PAGE_PATH
});

const FAQ_ITEMS: { question: string; answer: string; link?: { href: string; label: string } }[] = [
  {
    question: "¿Cómo sé si mi marca aparece en ChatGPT?",
    answer:
      "Escribe tu web arriba: le hacemos a ChatGPT una pregunta real de tu sector y te enseñamos su respuesta literal, si te nombra y qué otras marcas nombra. Sin registro ni tarjeta."
  },
  {
    question: "¿La comprobación es real o una simulación?",
    answer:
      "Real: es una consulta a ChatGPT en el momento en que pulsas el botón. Ves la pregunta exacta y la respuesta tal cual llegó."
  },
  {
    question: "Si no aparezco, ¿ChatGPT nunca me menciona?",
    answer:
      "No. Las respuestas cambian de una vez a otra. Para saberlo de verdad hay que repetir las preguntas principales de búsqueda múltiples veces en distintos momentos del tiempo."
  },
  {
    question: "¿Comprobáis también Gemini y Claude?",
    answer:
      "La comprobación gratis pregunta a ChatGPT. El escaneo completo, incluido en los 7 días de Pro, cubre además Gemini y Claude."
  },
  {
    question: "¿Qué otras herramientas gratis hay para medir la visibilidad en IA?",
    answer: "Varias herramientas de SEO tienen su comprobador. Las comparamos en nuestras comparativas de herramientas GEO.",
    link: { href: "/comparativas", label: "comparativas de herramientas GEO" }
  }
];

const MEANING = [
  {
    title: "Te nombra",
    body: "Buena señal, pero es una sola respuesta. Comprueba si se repite en otros motores y en otros momentos."
  },
  {
    title: "No te nombra",
    body: "No es un veredicto: las respuestas cambian. Sí te dice quién ocupa hoy ese hueco en tu sector."
  },
  {
    title: "Nombra a tus rivales",
    body: "Mira de qué fuentes lo saca. Ahí es donde te conviene aparecer."
  }
];

/** Filas de la comparación: [qué, comprobación gratis, escaneo completo]. */
const COMPARISON: [string, string, string][] = [
  ["Preguntas", "Una pregunta real de tu sector", "Las preguntas principales de búsqueda de tu sector"],
  ["Motores", "ChatGPT", "ChatGPT, Gemini y Claude"],
  ["Repetición", "Una consulta", "Múltiples veces en distintos momentos del tiempo"],
  [
    "Qué obtienes",
    "Respuesta, marcas y fuentes",
    "Puntuación GEO, competidores, fuentes citadas, auditoría de tu web y plan de acción"
  ],
  ["Registro", "No hace falta", "Cuenta sin tarjeta"]
];

const NEXT_LINKS = [
  { kicker: "Datos", title: "Estudios: qué marcas recomienda la IA en España", href: "/estudios" },
  {
    kicker: "Guía",
    title: "Cómo saber si tu marca aparece en ChatGPT, Gemini y Claude",
    href: "/blog/como-saber-si-tu-marca-aparece-en-chatgpt"
  },
  { kicker: "Gratis", title: "Pide el informe completo de tu sector", href: freeReportHref(FREE_REPORT_ENTRY.checker) }
];

const SIGNUP_HREF = "/signup";

export default function FreeCheckerPage() {
  const appJson = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": `${PAGE_URL}#app`,
    name: "Comprobador gratuito: ¿aparece tu marca en ChatGPT?",
    url: PAGE_URL,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "es-ES",
    isAccessibleForFree: true,
    description:
      "Le hace a ChatGPT una pregunta real de tu sector y enseña su respuesta literal, si nombra tu marca, qué competidores nombra y de qué fuentes lo saca.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    provider: { "@id": ORGANIZATION_ID }
  };

  const schemas = (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_ORIGIN },
          { name: "¿Aparece tu marca en ChatGPT?", url: PAGE_URL }
        ]}
      />
      <FaqPageSchema items={FAQ_ITEMS.map(({ question, answer }) => ({ question, answer }))} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appJson) }} />
    </>
  );

  // Sin `children`: la página entera vive en `hero`, porque cuando hay
  // resultado el formulario sustituye portada y contenido a la vez.
  return (
    <BlogPageShell
      activeHref={PAGE_PATH}
      hero={
        <>
        {schemas}
        {/* `Suspense` no es ceremonia: `FreeCheckerForm` lee `?d=` con
            `useSearchParams` (el dominio que el visitante escribió en la
            portada), y sin este límite Next no puede prerenderizar la página. */}
        <Suspense fallback={null}>
          <FreeCheckerForm
            heading={
              <>
                <nav className="art-hero-crumbs" aria-label="Migas de pan">
                  <span>
                    <Link href="/">Inicio</Link>
                  </span>
                  <span>
                    <span aria-hidden="true">/</span>
                    Herramientas gratis
                  </span>
                </nav>
                <p className="art-hero-eyebrow">Herramienta gratuita · sin registro</p>
                <h1>¿Aparece tu marca en ChatGPT? Compruébalo gratis</h1>
                <p className="art-hero-sub fc-hero-sub">
                  Escribe tu web y le hacemos a ChatGPT una pregunta real de tu sector, ahora mismo. Verás su
                  respuesta literal, si te nombra y qué competidores recomienda en tu lugar.
                </p>
              </>
            }
            note={
              <ul className="fc-hero-note">
                <li>Sin registro</li>
                <li>Sin tarjeta</li>
                <li>Respuesta real de ChatGPT</li>
              </ul>
            }
          >
            <div className="fcp">
              <section className="fcp-sec" aria-labelledby="fcp-example">
                <p className="fcp-kicker">01 · Qué verás</p>
                <h2 id="fcp-example">Así es un resultado</h2>
                <p className="fcp-lead">Ejemplo ilustrativo con datos inventados. El tuyo sale de una consulta en vivo.</p>
                <div className="fcp-example">
                  <div className="fcp-example-head">
                    <span className="fcp-lbl fcp-lbl-warn">Resultado de esta consulta</span>
                    <p className="fcp-verdict">ChatGPT no ha nombrado a tuweb.es en esta respuesta</p>
                  </div>
                  <div className="fcp-example-grid">
                    <div>
                      <span className="fcp-lbl">La pregunta que hicimos</span>
                      <p className="fcp-prompt">«¿Qué [tu tipo de producto] me recomiendas en España?»</p>
                      <span className="fcp-lbl fcp-lbl-gap">Respuesta de ChatGPT (extracto)</span>
                      <p className="fcp-answer">
                        «Entre las opciones más recomendadas están Competidor A, por su precio, y Competidor B, por
                        su servicio…»
                      </p>
                    </div>
                    <div>
                      <span className="fcp-lbl">Marcas que sí nombró</span>
                      <ul className="fcp-chips">
                        <li>Competidor A</li>
                        <li>Competidor B</li>
                        <li>Competidor C</li>
                      </ul>
                      <span className="fcp-lbl fcp-lbl-gap">De dónde lo sacó</span>
                      <ul className="fcp-sources">
                        <li>comparador-del-sector.es</li>
                        <li>competidor-a.es</li>
                        <li>un medio especializado</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </section>

              <section className="fcp-sec" aria-labelledby="fcp-meaning">
                <p className="fcp-kicker">02 · Cómo leerlo</p>
                <h2 id="fcp-meaning">Qué significa tu resultado</h2>
                <div className="fcp-cards">
                  {MEANING.map((m) => (
                    <div key={m.title} className="fcp-card">
                      <h3>{m.title}</h3>
                      <p>{m.body}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="fcp-sec" aria-labelledby="fcp-compare">
                <p className="fcp-kicker">03 · Gratis o completo</p>
                <h2 id="fcp-compare">Comprobación gratis frente a escaneo completo</h2>
                {/* Tabla en escritorio; en móvil, dos tarjetas con las mismas
                    filas (diseño aprobado). Una sola fuente: `COMPARISON`. */}
                <table className="fcp-table">
                  <thead>
                    <tr>
                      <td />
                      <th scope="col">Comprobación gratis</th>
                      <th scope="col" className="fcp-table-pro">
                        Escaneo completo (7 días de Pro gratis)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARISON.map(([row, free, full]) => (
                      <tr key={row}>
                        <th scope="row">{row}</th>
                        <td className="fcp-table-free">{free}</td>
                        <td>{full}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="fcp-plans">
                  <div className="fcp-plan">
                    <p className="fcp-plan-name">Comprobación gratis</p>
                    <ul>
                      {COMPARISON.map(([row, free]) => (
                        <li key={row}>{row === "Registro" ? "Sin registro" : free}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="fcp-plan fcp-plan-pro">
                    <p className="fcp-plan-name">Escaneo completo · 7 días de Pro gratis</p>
                    <ul>
                      {COMPARISON.map(([row, , full]) => (
                        <li key={row}>{full}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <Link className="fcp-cta" href={SIGNUP_HREF}>
                  Empezar los 7 días de Pro
                </Link>
              </section>

              <section className="fcp-sec" aria-labelledby="fcp-faq">
                <p className="fcp-kicker">04 · Preguntas frecuentes</p>
                <h2 id="fcp-faq">Preguntas frecuentes</h2>
                <div className="fcp-faq">
                  {FAQ_ITEMS.map((item) => (
                    <div key={item.question} className="fcp-faq-item">
                      <h3>{item.question}</h3>
                      <p>
                        {item.link ? (
                          <>
                            {item.answer.slice(0, item.answer.indexOf(item.link.label))}
                            <Link href={item.link.href}>{item.link.label}</Link>
                            {item.answer.slice(item.answer.indexOf(item.link.label) + item.link.label.length)}
                          </>
                        ) : (
                          item.answer
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <nav className="fcp-next" aria-label="Sigue leyendo">
                {NEXT_LINKS.map((l) => (
                  <Link key={l.href} href={l.href} className="fcp-next-card">
                    <span className="fcp-lbl">{l.kicker}</span>
                    <span className="fcp-next-title">{l.title}</span>
                  </Link>
                ))}
              </nav>
            </div>
          </FreeCheckerForm>
        </Suspense>
        </>
      }
    />
  );
}
