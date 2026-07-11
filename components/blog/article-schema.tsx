/**
 * schema.org Article structured data for a blog post — GROWTH-1's whole
 * point is being legible to AI crawlers/answer engines, so every post ships
 * this from day one rather than as a later add-on.
 */
export function ArticleSchema({
  title,
  description,
  slug,
  datePublished,
  coverImage
}: {
  title: string;
  description: string;
  slug: string;
  datePublished: string;
  coverImage?: string;
}) {
  const json = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    url: `https://www.genscore.es/blog/${slug}`,
    datePublished,
    dateModified: datePublished,
    author: { "@type": "Organization", name: "GenScore" },
    publisher: { "@type": "Organization", name: "GenScore" },
    ...(coverImage ? { image: `https://www.genscore.es${coverImage}` } : {})
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}
