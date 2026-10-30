/**
 * BLOG-FRESH-1 (log §348). Copyable example for the article
 * /blog/la-ia-prefiere-contenido-reciente: the two dates of an article,
 * declared the way Google documents them (datePublished + dateModified on an
 * Article) and the way the Auditoría técnica reads them (checkFreshness in
 * lib/web-audit/page-checks.ts). The test keeps both in step.
 */
export const ARTICLE_DATES_PUBLISHED = "2024-03-12";
export const ARTICLE_DATES_MODIFIED = "2026-10-20";

/** The visible line the article recommends, matching the structured dates. */
export const ARTICLE_DATES_VISIBLE_LINE =
  '<p class="fechas">Publicado el <time datetime="2024-03-12">12 de marzo de 2024</time>. Actualizado el <time datetime="2026-10-20">20 de octubre de 2026</time>.</p>';

export const ARTICLE_DATES_JSONLD = `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Cómo elegir un seguro de hogar",
  "datePublished": "${ARTICLE_DATES_PUBLISHED}",
  "dateModified": "${ARTICLE_DATES_MODIFIED}",
  "author": {
    "@type": "Organization",
    "name": "Tu empresa"
  }
}
</script>`;
