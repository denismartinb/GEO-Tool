/**
 * schema.org BreadcrumbList structured data (GROWTH-2 Fase 2.1). `items` is
 * the trail from the homepage down to the current page, each with its own
 * absolute URL — Google and answer engines use this to render/understand
 * the page's position in the site hierarchy independently of the visible nav.
 */
export function BreadcrumbSchema({ items }: { items: { name: string; url: string }[] }) {
  const json = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url
    }))
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}
