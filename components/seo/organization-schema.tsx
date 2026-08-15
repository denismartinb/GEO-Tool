/**
 * schema.org Organization structured data (GROWTH-2 Fase 2.1) — mounted once
 * in the root layout so every page ties back to the same entity. Deliberately
 * minimal: only facts that are actually true today (name, url, logo). No
 * `sameAs` social profiles — none exist yet, and inventing one would violate
 * the "no fake product behavior" rule as much as a fake metric would.
 */
export function OrganizationSchema() {
  const json = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "GenScore",
    url: "https://www.genscore.es",
    logo: "https://www.genscore.es/brand/genscore-tile.svg"
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}
