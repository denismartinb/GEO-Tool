import { ORGANIZATION_ID, SITE_ORIGIN } from "@/lib/brand/canonical-definition";

/**
 * schema.org Organization structured data (GROWTH-2 Fase 2.1) — mounted once
 * in the root layout so every page ties back to the same entity. Deliberately
 * minimal: only facts that are actually true today (name, url, logo). No
 * `sameAs` social profiles — none exist yet, and inventing one would violate
 * the "no fake product behavior" rule as much as a fake metric would.
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
    logo: `${SITE_ORIGIN}/brand/genscore-tile.svg`
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}
