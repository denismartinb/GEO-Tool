import type { Metadata } from "next";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { FreeCheckerForm } from "@/components/free-checker/free-checker-form";
import { KeyTakeaway } from "@/components/blog/article";
import { Icon } from "@/components/ui/icon";
import { contentMetadata } from "@/lib/seo/metadata";

const SITE_URL = "https://www.genscore.es";

/**
 * FREE-CHECKER-1 Fase A (Task Intake aprobado por el fundador, 2026-08-15).
 * Único propósito: captar el dominio y medir demanda real, sin gastar un
 * céntimo de LLM ni tocar esquema/RLS — todo eso queda para una fase de
 * backend aparte, sin aprobar todavía.
 *
 * Reutiliza el mismo mecanismo de arrastre que el hero de la landing
 * (`lib/onboarding/pending-domain.ts`, sin modificarlo) y el mismo shell que
 * `/glosario` y `/comparativas` (`BlogPageShell`), no un layout nuevo — la
 * regla de `growth-content.md` es que solo hay cinco shells de marketing y
 * ninguna página añade un `<Link>` de pie a mano.
 *
 * Honestidad deliberada: esta página NO ejecuta ninguna comprobación. Dice
 * exactamente eso — lleva al plan Free real (10 prompts, 1 motor), no a un
 * resultado instantáneo — porque prometer lo segundo y entregar lo primero es
 * el mismo "fake scan" que CLAUDE.md prohíbe, solo que en la página de
 * captación en vez de en el producto.
 */
export const metadata: Metadata = contentMetadata({
  title: "¿Aparece tu marca en ChatGPT? Comprobador gratuito — GenScore",
  description:
    "Comprueba si ChatGPT, Gemini y Claude mencionan tu marca al responder preguntas de tu categoría. Escaneo real del plan Free de GenScore, sin tarjeta.",
  path: "/gratis/aparece-mi-marca-en-chatgpt"
});

export default function FreeCheckerPage() {
  return (
    <BlogPageShell activeHref="/gratis/aparece-mi-marca-en-chatgpt">
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_URL },
          { name: "¿Aparece tu marca en ChatGPT?", url: `${SITE_URL}/gratis/aparece-mi-marca-en-chatgpt` }
        ]}
      />

      <div style={{ textAlign: "center", maxWidth: 640, margin: "0 auto" }}>
        <h1 className="lp-h1" style={{ fontSize: 42 }}>
          ¿Aparece tu marca cuando alguien le pregunta a la IA?
        </h1>
        <p className="lp-lead">
          Escribe tu dominio y lánzate a comprobarlo con un escaneo real: si ChatGPT, Gemini y Claude
          mencionan tu marca al responder preguntas de tu categoría, con qué protagonismo y frente a
          qué competidores.
        </p>
        <FreeCheckerForm />
        <div className="lp-hero-note" style={{ justifyContent: "center" }}>
          <span>
            <Icon name="check" size={14} className="text-[var(--pos)]" />
            Sin tarjeta
          </span>
          <span>
            <Icon name="check" size={14} className="text-[var(--pos)]" />
            Plan Free real
          </span>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "56px auto 0" }}>
        <KeyTakeaway label="Qué obtienes de verdad">
          Esto no es un resultado instantáneo — es el escaneo real del plan Free de GenScore: 10
          prompts reales de tu categoría, comprobados contra un motor de IA. Al registrarte, el
          dominio que escribiste arriba llega ya relleno al asistente, y desde ahí lanzas tu primer
          escaneo. Un escaneo tarda su tiempo porque de verdad llama a la IA — nada de plantillas ni
          resultados inventados.
        </KeyTakeaway>
      </div>

      <div className="legal-body" style={{ maxWidth: 640, margin: "48px auto 0" }}>
        <h2>¿Y si mi marca no aparece?</h2>
        <p>
          No es un veredicto definitivo con una sola comprobación — las respuestas de un motor
          generativo varían de una ejecución a otra, y por eso GenScore repite el mismo conjunto de
          prompts en cada escaneo en vez de fiarse de uno solo. Lo que sí verás desde el primer
          escaneo es un punto de partida real: si te mencionan o no, con qué competidores compites por
          esa mención, y qué podrías cambiar primero.
        </p>
        <p>
          Puedes leer más sobre cómo comprobarlo con detalle en{" "}
          <Link href="/blog/como-saber-si-tu-marca-aparece-en-chatgpt">
            cómo saber si tu marca aparece en ChatGPT, Gemini y Claude
          </Link>
          .
        </p>
      </div>
    </BlogPageShell>
  );
}
