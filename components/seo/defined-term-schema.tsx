/**
 * schema.org DefinedTerm structured data for a single glossary term page
 * (GROWTH-2 Fase 2.6b) — the counterpart to DefinedTermSetSchema, which
 * marks up the /glosario index as the set these terms belong to.
 *
 * SEO-POS-1 Fase E, E4: accepts an optional `id` and `sameAs`. A term the site
 * explains on more than one URL emits the SAME `@id` from every surface, with
 * `url` pointing at whichever one is the reference document and `sameAs`
 * listing the rest. That merges the surfaces into one node instead of leaving
 * three near-identical definitions competing for the same term — the semantic
 * equivalent of a canonical, without deindexing anything.
 */
export function DefinedTermSchema({
  term,
  description,
  url,
  inDefinedTermSetUrl,
  id,
  sameAs
}: {
  term: string;
  description: string;
  url: string;
  inDefinedTermSetUrl: string;
  id?: string;
  sameAs?: readonly string[];
}) {
  const json = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    ...(id ? { "@id": id } : {}),
    name: term,
    description,
    url,
    inDefinedTermSet: inDefinedTermSetUrl,
    ...(sameAs && sameAs.length > 0 ? { sameAs: [...sameAs] } : {})
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}
