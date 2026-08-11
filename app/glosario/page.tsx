import type { Metadata } from "next";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { DefinedTermSetSchema } from "@/components/seo/defined-term-set-schema";
import { GLOSSARY_TERMS } from "@/lib/glosario/terms";
import { contentMetadata } from "@/lib/seo/metadata";

const SITE_URL = "https://www.genscore.es";

export const metadata: Metadata = contentMetadata({
  title: "Glosario GEO — Genscore",
  description:
    "Los términos clave de GEO (Generative Engine Optimization) explicados en una frase: GEO, AEO, GEO Score, cuota de voz en IA, llms.txt, grounding y más.",
  path: "/glosario"
});

export default function GlosarioPage() {
  const sortedTerms = [...GLOSSARY_TERMS].sort((a, b) => a.term.localeCompare(b.term, "es"));

  return (
    <BlogPageShell>
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_URL },
          { name: "Glosario", url: `${SITE_URL}/glosario` }
        ]}
      />
      <DefinedTermSetSchema
        name="Glosario GEO de Genscore"
        terms={sortedTerms.map((t) => ({
          term: t.term,
          description: t.definition,
          url: `${SITE_URL}/glosario/${t.slug}`
        }))}
      />
      <h1 className="lp-h2">Glosario GEO</h1>
      <p className="legal-updated" style={{ marginBottom: 32 }}>
        Los términos clave de GEO (Generative Engine Optimization), explicados en una frase. Cada
        término tiene su propia página con la definición completa.
      </p>
      <div className="legal-body">
        {sortedTerms.map((t) => (
          <div key={t.slug}>
            <h2>
              <Link href={`/glosario/${t.slug}`}>{t.term}</Link>
            </h2>
            <p>{t.definition}</p>
          </div>
        ))}
      </div>
    </BlogPageShell>
  );
}
