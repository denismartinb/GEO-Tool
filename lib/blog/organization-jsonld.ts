/**
 * BLOG-SCHEMA-1 (log §433). Copyable example for the article
 * /blog/datos-estructurados-y-citas-de-la-ia: an Organization block whose
 * every field repeats something the page already shows, which is what
 * Google asks for ("structured data matches the visible text"). The test
 * checks it with checkStructuredData (lib/web-audit/page-checks.ts), the
 * same reader the Auditoría técnica uses.
 */
export const ORGANIZATION_NAME = "Cafetería Ejemplo";
export const ORGANIZATION_URL = "https://www.ejemplo.es";

/** The visible footer line the JSON-LD repeats, field by field. */
export const ORGANIZATION_VISIBLE_LINE =
  '<p>Cafetería Ejemplo · Calle Mayor 1, Madrid · <a href="https://www.instagram.com/cafeteriaejemplo">Instagram</a> · <a href="https://www.linkedin.com/company/cafeteriaejemplo">LinkedIn</a></p>';

export const ORGANIZATION_JSONLD = `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "${ORGANIZATION_NAME}",
  "url": "${ORGANIZATION_URL}",
  "logo": "${ORGANIZATION_URL}/logo.png",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Calle Mayor 1",
    "addressLocality": "Madrid",
    "addressCountry": "ES"
  },
  "sameAs": [
    "https://www.instagram.com/cafeteriaejemplo",
    "https://www.linkedin.com/company/cafeteriaejemplo"
  ]
}
</script>`;
