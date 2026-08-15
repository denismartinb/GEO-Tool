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
