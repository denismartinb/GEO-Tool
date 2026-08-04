/**
 * schema.org DefinedTerm structured data for a single glossary term page
 * (GROWTH-2 Fase 2.6b) — the counterpart to DefinedTermSetSchema, which
 * marks up the /glosario index as the set these terms belong to.
 */
export function DefinedTermSchema({
  term,
  description,
  url,
  inDefinedTermSetUrl
}: {
  term: string;
  description: string;
  url: string;
  inDefinedTermSetUrl: string;
}) {
  const json = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: term,
    description,
    url,
    inDefinedTermSet: inDefinedTermSetUrl
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}
