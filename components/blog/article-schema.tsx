import { ORGANIZATION_ID, ORGANIZATION_LOGO } from "@/lib/brand/canonical-definition";

/**
 * schema.org Article structured data for a blog post — GROWTH-1's whole
 * point is being legible to AI crawlers/answer engines, so every post ships
 * this from day one rather than as a later add-on.
 *
 * GEO-SELF-1 Fase 1: `author` and `publisher` were two inline
 * `{ "@type": "Organization", name: "GenScore" }` copies per article — two more
 * unnamed nodes called GenScore with no link to the site's `Organization`,
 * the exact ambiguity `.claude/rules/growth-content.md` ("Un nodo de
 * schema.org se referencia por `@id`") forbids. They now point AT that node by
 * `@id`; `publisher` also carries the raster logo inline, which is the one
 * property article rich results read from the publisher itself. No `Person`
 * author, by founder decision.
 */
export function ArticleSchema({
  title,
  description,
  slug,
  datePublished,
  dateUpdated,
  coverImage
}: {
  title: string;
  description: string;
  slug: string;
  datePublished: string;
  /** SEO-POS-1 (T9). Sin actualizaciones reales, cae a `datePublished` — igual que antes de que este prop existiera. */
  dateUpdated?: string;
  coverImage?: string;
}) {
  const json = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    url: `https://www.genscore.es/blog/${slug}`,
    datePublished,
    dateModified: dateUpdated ?? datePublished,
    author: { "@id": ORGANIZATION_ID },
    publisher: {
      "@id": ORGANIZATION_ID,
      "@type": "Organization",
      name: "GenScore",
      logo: { "@type": "ImageObject", ...ORGANIZATION_LOGO }
    },
    ...(coverImage ? { image: `https://www.genscore.es${coverImage}` } : {})
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}
