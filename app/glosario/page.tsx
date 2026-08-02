import type { Metadata } from "next";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { DefinedTermSetSchema } from "@/components/seo/defined-term-set-schema";
import { GLOSSARY_TERMS } from "@/lib/glosario/terms";

const SITE_URL = "https://www.genscore.es";

export const metadata: Metadata = {
  title: "Glosario GEO — Genscore",
  description:
    "Los términos clave de GEO (Generative Engine Optimization) explicados en una frase: GEO, AEO, GEO Score, cuota de voz en IA, llms.txt, grounding y más.",
  alternates: { canonical: `${SITE_URL}/glosario` }
};

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
          url: `${SITE_URL}/glosario#${t.slug}`
        }))}
      />
      <h1 className="lp-h2">Glosario GEO</h1>
      <p className="legal-updated" style={{ marginBottom: 32 }}>
        Los términos clave de GEO (Generative Engine Optimization), explicados en una frase.
      </p>
      <div className="legal-body">
        {sortedTerms.map((t) => (
          <div key={t.slug} id={t.slug}>
            <h2>{t.term}</h2>
            <p>{t.definition}</p>
          </div>
        ))}
      </div>
    </BlogPageShell>
  );
}
