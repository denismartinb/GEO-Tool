import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { FaqPageSchema } from "@/components/seo/faq-page-schema";
import { FreeCheckerForm } from "@/components/free-checker/free-checker-form";
import { KeyTakeaway } from "@/components/blog/article";
import { Icon } from "@/components/ui/icon";
import { contentMetadata } from "@/lib/seo/metadata";

const SITE_URL = "https://www.genscore.es";

/**
 * FREE-CHECKER-1 — el comprobador gratuito anónimo.
 *
 * **Por qué el titular puede decir ChatGPT.** Porque la comprobación pregunta
 * a ChatGPT de verdad (`PUBLIC_CHECK_ENGINE`). Mientras el motor fue Gemini,
 * este título habría sido el mismo reclamo falso que PRICING-TRUTH-1 retiró
 * del producto; el fundador cambió el motor precisamente para que la página
 * pudiera llamarse por su nombre (2026-08-15).
 *
 * **Y por qué no canibaliza a S1.** `/blog/como-saber-si-tu-marca-aparece-en-
 * chatgpt` ya ocupa la consulta INFORMACIONAL ("cómo saber si…"): es una guía
 * de tres métodos para quien quiere entenderlo. Esta página ocupa la
 * TRANSACCIONAL ("compruébalo ahora"): quien no quiere leer nada. Misma
 * keyword raíz, intención distinta, SERP distinta — y se enlazan entre sí en
 * vez de competir.
 *
 * **Los tres motores aparecen, cada uno donde es cierto.** ChatGPT es lo que
 * ejecuta la comprobación gratuita y por eso manda en el titular. Gemini y
 * Claude son lo que añade el escaneo completo, así que viven en el escalón de
 * pago y en las FAQ. Nombrarlos ahí no es relleno: el producto los ejecuta de
 * verdad, y una página sobre visibilidad en IA que sólo nombrara uno estaría
 * describiendo mal lo que se vende.
 */
export const metadata: Metadata = contentMetadata({
  title: "¿Aparece tu marca en ChatGPT? Compruébalo gratis — GenScore",
  description:
    "Comprueba gratis y sin registro si ChatGPT menciona tu marca al responder preguntas de tu categoría, y qué competidores nombra en tu lugar. El escaneo completo cubre además Gemini y Claude.",
  path: "/gratis/aparece-mi-marca-en-chatgpt"
});

const FAQ_ITEMS = [
  {
    question: "¿Cómo sé si mi marca aparece en ChatGPT?",
    answer:
      "Escribiendo tu dominio arriba: lanzamos una pregunta real de tu categoría a ChatGPT y te enseñamos su respuesta literal, si tu marca aparece en ella y qué otras marcas nombra. No hace falta registro ni tarjeta."
  },
  {
    question: "¿La comprobación es real o una simulación?",
    answer:
      "Es una llamada real a ChatGPT en el momento en que pulsas el botón. Te enseñamos la pregunta exacta que lanzamos y la respuesta tal cual la devolvió, sin plantillas ni resultados guardados."
  },
  {
    question: "Si no aparezco en esta comprobación, ¿significa que ChatGPT nunca me menciona?",
    answer:
      "No. Las respuestas de un motor generativo varían de una ejecución a otra, así que una sola consulta es una muestra, no un veredicto. Para saberlo de verdad hace falta repetir un conjunto de preguntas en el tiempo, que es lo que hace el escaneo completo."
  },
  {
    question: "¿Comprobáis también Gemini y Claude?",
    answer:
      "La comprobación gratuita pregunta a ChatGPT. El escaneo del plan Free, al crear una cuenta, cubre además Gemini y Claude sobre diez preguntas reales de tu categoría y repite en el tiempo para que veas la evolución."
  },
  {
    question: "¿Cuánto cuesta?",
    answer:
      "La comprobación es gratuita y anónima. El escaneo completo está en el plan Free de GenScore, que tampoco pide tarjeta."
  }
];

export default function FreeCheckerPage() {
  return (
    <BlogPageShell activeHref="/gratis/aparece-mi-marca-en-chatgpt">
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_URL },
          {
            name: "¿Aparece tu marca en ChatGPT?",
            url: `${SITE_URL}/gratis/aparece-mi-marca-en-chatgpt`
          }
        ]}
      />
      <FaqPageSchema items={FAQ_ITEMS} />

      {/* `Suspense` no es ceremonia: `FreeCheckerForm` lee `?d=` con
          `useSearchParams` desde HOME-2026-08 —el dominio que el visitante
          escribió en el hero de la portada—, y sin este límite Next no puede
          prerenderizar la página, que es estática y tiene que seguir siéndolo.
          El respaldo va vacío a propósito: el formulario aparece en cuanto
          hidrata y un esqueleto aquí sólo añadiría un salto de layout. */}
      <Suspense fallback={null}>
      <FreeCheckerForm
        heading={
          <div style={{ textAlign: "center", maxWidth: 640, margin: "0 auto 26px" }}>
            <h1 className="lp-h1" style={{ fontSize: 42 }}>
              ¿Aparece tu marca cuando alguien le pregunta a ChatGPT?
            </h1>
            <p className="lp-lead">
              Escribe tu dominio y te lo comprobamos ahora, gratis y sin registro: le hacemos a
              ChatGPT una pregunta real de tu categoría y te enseñamos su respuesta, si te menciona
              y qué competidores nombra en tu lugar.
            </p>
          </div>
        }
      >
        <div className="lp-hero-note" style={{ justifyContent: "center" }}>
          <span>
            <Icon name="check" size={14} className="text-[var(--pos)]" />
            Sin registro
          </span>
          <span>
            <Icon name="check" size={14} className="text-[var(--pos)]" />
            Sin tarjeta
          </span>
          <span>
            <Icon name="check" size={14} className="text-[var(--pos)]" />
            Respuesta real de ChatGPT
          </span>
        </div>

        <div style={{ maxWidth: 640, margin: "56px auto 0" }}>
          <KeyTakeaway label="Qué comprobamos exactamente">
            Le lanzamos a ChatGPT una pregunta que un cliente tuyo haría de verdad, y leemos su
            respuesta literal buscando tu marca. Verás la pregunta que hicimos, la respuesta
            completa, si ChatGPT te nombró o no, y las marcas que sí nombró. Nada de esto está
            guardado de antes: es una llamada en vivo en el momento en que pulsas el botón.
          </KeyTakeaway>
        </div>

        <div className="legal-body" style={{ maxWidth: 640, margin: "48px auto 0" }}>
          <h2>Por qué importa aparecer en ChatGPT</h2>
          <p>
            Cuando alguien le pregunta a ChatGPT por una recomendación, la respuesta nombra dos o
            tres marcas y la decisión se toma ahí, sin que el usuario visite ninguna web. Si tu
            marca no está entre esas dos o tres, no has perdido una posición en una lista: no has
            entrado en la conversación. Y a diferencia de un buscador, no hay una página de
            resultados donde aparezcas más abajo.
          </p>

          <h2>Si ChatGPT no te menciona en esta comprobación</h2>
          <p>
            No es un veredicto. Las respuestas de un motor generativo cambian de una ejecución a
            otra —buscan en tiempo real y no son deterministas—, así que una consulta suelta es una
            muestra con su propio margen de error. Lo que sí te dice, y es accionable, es qué marcas
            ocupan hoy ese hueco en tu categoría.
          </p>
          <p>
            Para saber si te mencionan <em>de verdad</em> hace falta repetir un conjunto de
            preguntas en el tiempo. Eso es lo que hace el escaneo del plan Free al crear una cuenta:
            diez preguntas reales de tu categoría, y no solo en ChatGPT — también en{" "}
            <strong>Gemini</strong> y <strong>Claude</strong>, que son los otros dos motores que
            GenScore ejecuta. Cada motor responde distinto, y aparecer en uno no significa aparecer
            en los tres.
          </p>

          <h2>Preguntas frecuentes</h2>
          {FAQ_ITEMS.map((item) => (
            <div key={item.question}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: "22px 0 8px" }}>
                {item.question}
              </h3>
              <p>{item.answer}</p>
            </div>
          ))}

          <h2>Sigue leyendo</h2>
          <p>
            Si prefieres entender el método antes de probarlo, la guía completa está en{" "}
            <Link href="/blog/como-saber-si-tu-marca-aparece-en-chatgpt">
              cómo saber si tu marca aparece en ChatGPT, Gemini y Claude
            </Link>
            . Y si lo que quieres es que te mencionen más,{" "}
            <Link href="/blog/como-conseguir-que-chatgpt-te-cite">
              cómo conseguir que ChatGPT te cite
            </Link>{" "}
            explica qué mueve esa aguja de verdad.
          </p>
        </div>
      </FreeCheckerForm>
      </Suspense>

    </BlogPageShell>
  );
}
