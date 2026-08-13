import type { Metadata } from "next";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { contentMetadata } from "@/lib/seo/metadata";

const SITE_URL = "https://www.genscore.es";

export const metadata: Metadata = contentMetadata({
  title: "Comparativas — Genscore",
  description: "Genscore frente a otras herramientas de visibilidad en IA, comparado de forma honesta.",
  path: "/comparativas"
});

/**
 * GROWTH-2 Fase 2.8 — índice de /comparativas. Hasta ahora esta URL no
 * existía como página real, solo como referencia dentro del BreadcrumbSchema
 * de genscore-vs-otterly y genscore-vs-peec-ai (Fase 2.4/2.6c) — datos
 * estructurados declarando una URL que no resolvía a nada.
 */
const COMPARISONS = [
  { href: "/comparativas/mejores-herramientas-geo-en-espanol", title: "Las mejores herramientas GEO en 2026" },
  { href: "/comparativas/genscore-vs-otterly", title: "Genscore vs Otterly" },
  { href: "/comparativas/genscore-vs-peec-ai", title: "Genscore vs Peec AI" },
  { href: "/comparativas/genscore-vs-profound", title: "Genscore vs Profound" },
  { href: "/comparativas/alternativas-a-otterly", title: "Alternativas a Otterly en 2026" }
];

export default function ComparativasIndexPage() {
  return (
    <BlogPageShell activeHref="/comparativas">
      <BreadcrumbSchema items={[{ name: "Inicio", url: SITE_URL }, { name: "Comparativas", url: `${SITE_URL}/comparativas` }]} />
      <h1 className="lp-h2">Comparativas</h1>
      <p className="legal-updated" style={{ marginBottom: 32 }}>
        Genscore frente a otras herramientas de visibilidad en IA, comparado de forma honesta —
        incluidos los puntos donde la otra herramienta gana.
      </p>
      <div className="legal-body">
        <ul>
          {COMPARISONS.map((c) => (
            <li key={c.href}>
              <Link href={c.href}>{c.title}</Link>
            </li>
          ))}
        </ul>
      </div>
    </BlogPageShell>
  );
}
