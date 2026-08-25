import type { Metadata } from "next";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { contentMetadata } from "@/lib/seo/metadata";

const SITE_URL = "https://www.genscore.es";

export const metadata: Metadata = contentMetadata({
  title: "Comparativas — GenScore",
  description: "GenScore frente a otras herramientas de visibilidad en IA, comparado de forma honesta.",
  path: "/comparativas"
});

/**
 * GROWTH-2 Fase 2.8 — índice de /comparativas. Hasta ahora esta URL no
 * existía como página real, solo como referencia dentro del BreadcrumbSchema
 * de genscore-vs-otterly y genscore-vs-peec-ai (Fase 2.4/2.6c) — datos
 * estructurados declarando una URL que no resolvía a nada.
 *
 * `description` (2026-08-25, fundador: "esta página parece de los años 90,
 * hazla más visual, en línea con el nuevo diseño de /blog"): una línea real
 * de qué compara cada página, no relleno — es lo que convierte la lista de
 * enlaces en tarjetas.
 */
const COMPARISONS = [
  {
    href: "/comparativas/mejores-herramientas-geo-en-espanol",
    title: "Las mejores herramientas GEO en 2026",
    description: "Todas las herramientas de visibilidad en IA relevantes en el mercado hispanohablante, una al lado de otra."
  },
  {
    href: "/comparativas/genscore-vs-otterly",
    title: "GenScore vs Otterly",
    description: "Fila por fila, incluidos los puntos donde gana Otterly."
  },
  {
    href: "/comparativas/genscore-vs-peec-ai",
    title: "GenScore vs Peec AI",
    description: "Fila por fila, incluidos los puntos donde gana Peec AI."
  },
  {
    href: "/comparativas/genscore-vs-profound",
    title: "GenScore vs Profound",
    description: "Fila por fila, incluidos los puntos donde gana Profound."
  },
  {
    href: "/comparativas/alternativas-a-otterly",
    title: "Alternativas a Otterly en 2026",
    description: "Si Otterly no encaja, qué mirar en su lugar — y cómo se compara GenScore."
  }
];

export default function ComparativasIndexPage() {
  return (
    <BlogPageShell activeHref="/comparativas">
      <BreadcrumbSchema items={[{ name: "Inicio", url: SITE_URL }, { name: "Comparativas", url: `${SITE_URL}/comparativas` }]} />
      <h1 className="lp-h2">Comparativas</h1>
      <p className="legal-updated" style={{ marginBottom: 32 }}>
        GenScore frente a otras herramientas de visibilidad en IA, comparado de forma honesta —
        incluidos los puntos donde la otra herramienta gana.
      </p>
      <div className="compare-index-grid">
        {COMPARISONS.map((c) => (
          <Link key={c.href} href={c.href} className="compare-index-card">
            <span className="compare-index-card-eyebrow">Comparativa</span>
            <h2>{c.title}</h2>
            <p>{c.description}</p>
          </Link>
        ))}
      </div>
    </BlogPageShell>
  );
}
