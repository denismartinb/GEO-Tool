/**
 * Las cuatro superficies de contenido público, en un solo sitio.
 *
 * SEO-POS-1 (T3): hasta 2026-08-09 `/glosario` y `/comparativas` no estaban
 * enlazadas desde ninguna navegación ni pie de página — 21 URLs alcanzables
 * solo por sitemap y llms.txt, es decir sin ningún flujo de enlazado interno
 * desde el resto del sitio. `/docs` solo se enlazaba a sí misma desde su
 * propio shell. Este módulo existe para que las cuatro capas de
 * `docs/content-strategy.md` §2 entren juntas en todos los pies de página y no
 * se vuelvan a desincronizar de una en una.
 *
 * Guardado por `components/marketing-content-links.test.ts`: cada shell de
 * marketing debe renderizar esta lista, no una copia a mano.
 */
export const MARKETING_CONTENT_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/blog", label: "Blog" },
  { href: "/docs", label: "Docs" },
  { href: "/glosario", label: "Glosario" },
  { href: "/comparativas", label: "Comparativas" }
];
