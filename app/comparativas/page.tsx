import type { Metadata } from "next";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { COMPARATIVAS_INDEX } from "@/lib/comparativas";
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
 * La lista vive en `lib/comparativas/index.ts` (BLOG-COVERS-2026-08): el
 * carril de Comparativas de `/blog` la reutiliza, así que un slug o título
 * que cambie no puede desincronizarse entre las dos superficies.
 */
export default function ComparativasIndexPage() {
  return (
    <BlogPageShell activeHref="/comparativas">
      <BreadcrumbSchema items={[{ name: "Inicio", url: SITE_URL }, { name: "Comparativas", url: `${SITE_URL}/comparativas` }]} />
      <h1 className="lp-h2">Comparativas</h1>
      <p className="legal-updated" style={{ marginBottom: 32 }}>
        GenScore frente a otras herramientas de visibilidad en IA, comparado de forma honesta —
        incluidos los puntos donde la otra herramienta gana.
      </p>
      <div className="legal-body">
        <ul>
          {COMPARATIVAS_INDEX.map((c) => (
            <li key={c.href}>
              <Link href={c.href}>{c.title}</Link>
            </li>
          ))}
        </ul>
      </div>
    </BlogPageShell>
  );
}
