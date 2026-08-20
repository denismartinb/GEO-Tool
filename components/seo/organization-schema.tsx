import { ORGANIZATION_ID, SITE_ORIGIN } from "@/lib/brand/canonical-definition";

/**
 * schema.org Organization structured data (GROWTH-2 Fase 2.1) — mounted once
 * in the root layout so every page ties back to the same entity. Only facts
 * that are actually true today. `sameAs` lists only profiles that exist for
 * real (log §121) — a profile not in this list simply hasn't been created
 * yet; do not add one until the founder hands over its real URL.
 *
 * SEO-POS-1 Fase E, E3: gains a stable `@id` so the `SoftwareApplication`
 * node can point AT this organization instead of carrying its own inline copy.
 * Two nodes called "GenScore" with no shared identifier are two entities as
 * far as a parser is concerned, which is the exact ambiguity Fase E exists to
 * remove.
 */
export function OrganizationSchema() {
  const json = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: "GenScore",
    url: SITE_ORIGIN,
    logo: `${SITE_ORIGIN}/brand/genscore-tile.svg`,
    sameAs: ["https://www.linkedin.com/company/genscore/", "https://www.g2.com/sellers/genscore"]
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}
