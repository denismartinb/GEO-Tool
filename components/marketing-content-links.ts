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

/**
 * Páginas de **entidad**: las que explican qué es GenScore y qué es el GEO.
 *
 * Lista aparte de `MARKETING_CONTENT_LINKS` a propósito. Aquélla son las
 * cuatro capas de `docs/content-strategy.md` §2 y su test lo fija por
 * igualdad exacta; meter aquí una quinta entrada rompería esa semántica y el
 * test que la protege. Pero el problema que resuelven es el mismo —enlace
 * entrante desde todos los pies, sin añadir un `<Link>` a mano en seis shells
 * que luego se desincronizan de uno en uno (log §46)— así que la solución es
 * la misma: una lista compartida, no seis copias.
 *
 * `/que-es-genscore` necesita ese enlazado más que ninguna otra página del
 * sitio: es la fuente primaria con la que competimos contra los otros
 * GenScore públicos, y una fuente primaria sin enlaces entrantes del propio
 * dominio es una declaración que nadie respalda (SEO-POS-1 Fase E, E2).
 */
export const MARKETING_ENTITY_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/que-es-genscore", label: "Qué es GenScore" }
];

/**
 * Los shells de marketing con un pie de página público completo — la lista
 * que `marketing-content-links.test.ts` y `payment-badges.test.ts` recorren
 * para comprobar que su footer no se ha quedado atrás. Vive aquí, en el
 * módulo fuente y no en un `.test.ts`, para que los dos tests lean la MISMA
 * lista en vez de mantener cada uno su propia copia — es el mismo argumento
 * por el que `MARKETING_CONTENT_LINKS` existe: una lista compartida, no
 * varias que se desincronizan de una en una (log §46).
 *
 * `components/not-found-mission.tsx` SÍ entra (NOT-FOUND-ROCKET-1): la 404
 * pública tiene su propio shell —no reutiliza `BlogPageShell` porque
 * `.lp-inner` impide la escena a sangre— así que es una superficie más con
 * pie público, justo la clase de sitio donde se olvidan las cuatro capas de
 * contenido.
 *
 * `app/geo/page.tsx` queda fuera a propósito: su pie ya es una versión
 * reducida a mano (sin `MARKETING_CONTENT_LINKS` ni `MARKETING_ENTITY_LINKS`)
 * — una divergencia anterior a esta lista y fuera de lo que aquí se arregla.
 */
export const MARKETING_SHELLS: readonly string[] = [
  "components/landing/landing-page.tsx",
  "components/pricing/pricing-page.tsx",
  "components/blog/blog-page-shell.tsx",
  "components/docs/docs-page-shell.tsx",
  "components/legal-page-shell.tsx",
  "components/not-found-mission.tsx"
];
