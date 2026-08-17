import type { Metadata } from "next";
import Link from "next/link";
import { DocsPageShell } from "@/components/docs/docs-page-shell";
import { DOCS_NAV } from "@/lib/docs/nav";
import { contentMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = contentMetadata({
  title: "Documentación — GenScore",
  description:
    "Cómo funciona GenScore: primer escaneo, qué muestra cada informe, cómo se calcula el GEO Score, y qué incluye cada plan.",
  path: "/docs"
});

export default function DocsIndexPage() {
  return (
    <DocsPageShell>
      <h1>Documentación</h1>
      <p className="docs-updated">Cómo funciona GenScore, informe por informe.</p>
      <p>
        Esta sección documenta el producto tal cual es hoy: qué hace cada informe, cómo se calculan sus
        métricas, y qué incluye cada plan. Si una función no está descrita aquí, es porque todavía no existe
        en el producto.
      </p>
      {DOCS_NAV.map((section) => (
        <div key={section.title}>
          <h2>{section.title}</h2>
          <div className="docs-index-grid">
            {section.pages.map((page) => (
              <Link key={page.slug} href={`/docs/${page.slug}`} className="docs-index-card">
                <div className="eyebrow">{section.title}</div>
                <h3>{page.title}</h3>
                <p>{page.description}</p>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </DocsPageShell>
  );
}
