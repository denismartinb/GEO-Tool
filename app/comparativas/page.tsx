import type { Metadata } from "next";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { COMPARATIVAS_INDEX } from "@/lib/comparativas";
import { contentMetadata } from "@/lib/seo/metadata";

const SITE_URL = "https://www.genscore.es";

export const metadata: Metadata = contentMetadata({
  title: "Comparativas de herramientas de GEO (visibilidad en IA) — GenScore",
  description:
    "Herramientas para medir si ChatGPT, Gemini y Claude nombran tu marca, comparadas fila a fila: precios, motores, idiomas y para quién es cada una.",
  path: "/comparativas"
});

/**
 * GROWTH-2 Fase 2.8 — índice de /comparativas. Hasta ahora esta URL no
 * existía como página real, solo como referencia dentro del BreadcrumbSchema
 * de genscore-vs-otterly y genscore-vs-peec-ai (Fase 2.4/2.6c) — datos
 * estructurados declarando una URL que no resolvía a nada.
 *
 * La lista vive en `lib/comparativas/index.ts` (BLOG-COVERS-2026-08): el
 * carril de Comparativas de `/blog` la reutiliza, así que un slug o título
 * que cambie no puede desincronizarse entre las dos superficies.
 */
export default function ComparativasIndexPage() {
  return (
    <BlogPageShell activeHref="/comparativas">
      <BreadcrumbSchema items={[{ name: "Inicio", url: SITE_URL }, { name: "Comparativas", url: `${SITE_URL}/comparativas` }]} />
      <h1 className="lp-h2">Comparativas de herramientas de GEO</h1>
      <p className="legal-updated" style={{ marginBottom: 32 }}>
        GenScore frente a otras herramientas de visibilidad en IA, comparado de forma honesta —
        incluidos los puntos donde la otra herramienta gana.
      </p>
      <div className="legal-body">
        <p>
          Aquí GEO quiere decir posicionamiento en motores de IA (Generative Engine Optimization),
          no geolocalización. Las herramientas que comparamos responden a una misma pregunta:
          cuando alguien le pregunta a ChatGPT, Gemini o Claude por lo que vendes, ¿te nombran, en
          qué lugar, y qué páginas citan para decidirlo?
        </p>
        <p>
          Cada comparativa enfrenta las herramientas fila a fila con los mismos criterios: precio
          de entrada y escalones, motores incluidos y los que se cobran aparte, número de
          preguntas que puedes seguir, países e idiomas, si la herramienta te dice qué cambiar o
          sólo mide, y para qué tipo de equipo está pensada. Los precios de terceros son los
          que publicaban en su web cuando se revisó cada página, y se marcan como orientativos
          cuando no los publican.
        </p>
        <p>
          GenScore es nuestra herramienta y lo decimos en cada página. Por eso las comparativas
          entre terceros (como Profound, Peec AI y Otterly) no nos incluyen en el veredicto, y en
          las nuestras señalamos dónde otra opción encaja mejor.
        </p>
        <ul>
          {COMPARATIVAS_INDEX.map((c) => (
            <li key={c.href}>
              <Link href={c.href}>{c.title}</Link>: {c.blurb}
            </li>
          ))}
        </ul>
        <p>
          ¿Prefieres verlo con tu propia marca? El{" "}
          <Link href="/gratis/aparece-mi-marca-en-chatgpt">comprobador gratuito</Link> hace una
          pregunta real a ChatGPT y te enseña si te nombra y qué fuentes usa.
        </p>
      </div>
    </BlogPageShell>
  );
}
