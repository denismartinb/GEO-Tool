import {
  CANONICAL_DEFINITION,
  CONTACT_EMAIL,
  FOUNDING_YEAR,
  ORGANIZATION_ID,
  ORGANIZATION_LOGO,
  ORGANIZATION_SAME_AS,
  SITE_ORIGIN
} from "@/lib/brand/canonical-definition";

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
 *
 * GEO-SELF-1 Fase 1: the node gains what an engine needs to describe the
 * company in one breath — `description` (the canonical sentence, imported, never
 * re-worded: `.claude/rules/growth-content.md`, "La descripción de GenScore se
 * importa, no se redacta"), `foundingDate`, `areaServed` and `knowsAbout` — and
 * a raster `logo`, because Google rejects SVG as an organization logo. No
 * `founder` and no `Person` anywhere, by founder decision: the entity is the
 * company. No `slogan` either: the brand docs define none, and inventing one
 * here would be the only place it exists.
 */
export function OrganizationSchema() {
  const json = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: "GenScore",
    url: SITE_ORIGIN,
    description: CANONICAL_DEFINITION,
    logo: { "@type": "ImageObject", ...ORGANIZATION_LOGO },
    foundingDate: FOUNDING_YEAR,
    areaServed: { "@type": "Country", name: "España" },
    knowsAbout: ["GEO", "Generative Engine Optimization", "visibilidad en IA", "AEO"],
    email: CONTACT_EMAIL,
    sameAs: [ORGANIZATION_SAME_AS.linkedin, ORGANIZATION_SAME_AS.g2]
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}
