import type { Metadata } from "next";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { ArticleCta, KeyTakeaway } from "@/components/blog/article";
import { contentMetadata } from "@/lib/seo/metadata";
import { SITE_ORIGIN } from "@/lib/brand/canonical-definition";
import { EDITION, CITIES, CITY_IDS } from "@/lib/observatorio/clinicas-dentales";

const PAGE_PATH = "/observatorio";
const PAGE_URL = `${SITE_ORIGIN}${PAGE_PATH}`;

/**
 * OBSERVATORIO-DENTAL-1: portada del observatorio de visibilidad en IA.
 * Activo permanente que convierte los estudios sectoriales en páginas
 * agregadas por sector y ciudad, siempre con datos de mediciones reales ya
 * publicadas. Regla pública (Denis, 28-10-2026): solo se nombran negocios
 * que la IA recomienda; quién no aparece solo lo ve cada negocio en su
 * diagnóstico privado.
 */
export const metadata: Metadata = contentMetadata({
  title: "Observatorio de visibilidad en IA · GenScore",
  description:
    "Qué negocios recomiendan ChatGPT, Gemini y Claude, medido con preguntas reales y publicado por sector y ciudad. Primera edición: clínicas dentales en Madrid y Valencia.",
  path: PAGE_PATH
});

export default function ObservatorioPage() {
  return (
    <BlogPageShell
      activeHref={PAGE_PATH}
      breadcrumb={[{ label: "Observatorio", href: PAGE_PATH }]}
    >
      <BreadcrumbSchema items={[{ name: "Inicio", url: SITE_ORIGIN }, { name: "Observatorio", url: PAGE_URL }]} />

      <h1 className="lp-h2">Observatorio de visibilidad en IA</h1>
      <p className="legal-updated" style={{ marginBottom: 36 }}>
        Qué negocios recomienda la IA cuando alguien pregunta por un servicio en su ciudad, medido con preguntas reales en ChatGPT, Gemini y Claude.
      </p>

      <div className="blog-body">
        <KeyTakeaway label="Cómo leer esto">
          Cada edición mide un sector en varias ciudades y publica el resultado agregado: qué negocios nombra la IA y con qué frecuencia. Solo nombramos negocios que la IA recomienda; no publicamos quién no aparece. No es un juicio sobre la calidad de ningún negocio.
        </KeyTakeaway>

        <h2>Sectores medidos</h2>
        <section style={{ marginTop: 12 }}>
          <p className="legal-updated" style={{ marginBottom: 0 }}>
            Dato propio · Edición {EDITION.label}
          </p>
          <h3 style={{ marginTop: 6 }}>
            <Link href="/observatorio/clinicas-dentales">Clínicas dentales</Link>
          </h3>
          <p>
            {CITY_IDS.map((id) => CITIES[id].name).join(" y ")}: las clínicas que más aparecen en las respuestas de la IA, ciudad a ciudad y motor a motor.{" "}
            <Link href="/observatorio/clinicas-dentales">Ver el ranking</Link>
          </p>
        </section>

        <p style={{ marginTop: 32 }}>
          La evolución de cada sector se publicará en este observatorio cuando haya nuevas mediciones.
        </p>

        <ArticleCta
          title="¿Aparece tu negocio cuando la IA responde?"
          text="GenScore mide si ChatGPT, Gemini y Claude te recomiendan, con las preguntas de tu sector y tu ciudad, y te dice qué cambiar para aparecer. Prueba de 7 días, sin tarjeta."
          cta="Medir mi negocio gratis"
          href="/signup"
        />
      </div>
    </BlogPageShell>
  );
}
