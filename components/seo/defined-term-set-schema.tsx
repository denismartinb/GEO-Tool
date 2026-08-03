/**
 * schema.org DefinedTermSet structured data (GROWTH-2 Fase 2.4) — one entry
 * per glossary term, each with its own in-page anchor as its `url` so a
 * model or search engine can cite the exact definition, not just the page.
 */
export function DefinedTermSetSchema({
  name,
  terms
}: {
  name: string;
  terms: { term: string; description: string; url: string }[];
}) {
  const json = {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    name,
    hasDefinedTerm: terms.map((t) => ({
      "@type": "DefinedTerm",
      name: t.term,
      description: t.description,
      url: t.url
    }))
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}
