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
  { href: "/que-es-genscore", label: "Qué es GenScore" },
  // GEO-SELF-1 Fase 1: la página `AboutPage` de la empresa. Misma razón que la
  // de arriba — una página de entidad sin enlaces entrantes no la respalda nadie.
  { href: "/sobre-genscore", label: "Quiénes somos" },
  // GEO-SELF-1 Fase 4 (log §260): the studies hub — the data that backs the
  // entity. Same reason: a page meant to be cited needs inbound links.
  { href: "/estudios", label: "Estudios" }
];

/**
 * FREE-REPORT-2 (log §252): la oferta de captación, en todos los pies de
 * página públicos. Lista aparte por el mismo motivo que
 * `MARKETING_ENTITY_LINKS`: `MARKETING_CONTENT_LINKS` son las cuatro capas de
 * contenido y su test las fija por igualdad exacta.
 */
export const MARKETING_LEAD_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/gratis/informe-geo", label: "Informe gratis" },
  // AFFILIATES-1: the affiliate programme is acquisition too — through the
  // people who recommend us — so it lives in this list, in every footer.
  // FOOTER-UNIFY-1: labelled «Programa de afiliados» at the founder's request.
  { href: "/afiliados", label: "Programa de afiliados" }
];

type FooterLink = { href: string; label: string };

function fromList(list: ReadonlyArray<FooterLink>, href: string): FooterLink {
  const link = list.find((l) => l.href === href);
  if (!link) throw new Error(`${href} no está en su lista compartida`);
  return link;
}

/**
 * FOOTER-UNIFY-1: the four columns of the one public footer
 * (`components/marketing/public-footer.tsx`). Every href of the three shared
 * lists above lands in exactly one column — `marketing-content-links.test.ts`
 * checks it — so a page added to a list reaches every footer without touching
 * this layout. Links that are not in a list (anchors, `/precios`, `/demo`,
 * the checker, `/geo`) are written here, once, instead of once per page.
 */
export const PUBLIC_FOOTER_GROUPS: ReadonlyArray<{ title: string; links: ReadonlyArray<FooterLink> }> = [
  {
    title: "Producto",
    links: [
      { href: "/#producto", label: "Producto" },
      { href: "/#como", label: "Cómo funciona" },
      { href: "/precios", label: "Precios" },
      { href: "/demo", label: "Videollamada de 20 min" }
    ]
  },
  {
    title: "Gratis",
    links: [
      { href: "/gratis/aparece-mi-marca-en-chatgpt", label: "Comprobador gratis" },
      fromList(MARKETING_LEAD_LINKS, "/gratis/informe-geo")
    ]
  },
  {
    title: "Recursos",
    links: [
      fromList(MARKETING_CONTENT_LINKS, "/blog"),
      fromList(MARKETING_ENTITY_LINKS, "/estudios"),
      fromList(MARKETING_CONTENT_LINKS, "/comparativas"),
      fromList(MARKETING_CONTENT_LINKS, "/glosario"),
      fromList(MARKETING_CONTENT_LINKS, "/docs"),
      { href: "/geo", label: "Qué es GEO" }
    ]
  },
  {
    title: "Empresa",
    links: [
      fromList(MARKETING_ENTITY_LINKS, "/que-es-genscore"),
      fromList(MARKETING_ENTITY_LINKS, "/sobre-genscore"),
      fromList(MARKETING_LEAD_LINKS, "/afiliados")
    ]
  }
];

/** FOOTER-UNIFY-1: the legal line at the bottom of the public footer. */
export const PUBLIC_FOOTER_LEGAL_LINKS: ReadonlyArray<FooterLink> = [
  { href: "/privacidad", label: "Privacidad" },
  { href: "/cookies", label: "Cookies" },
  { href: "/terminos", label: "Términos" }
];

/**
 * Every public page with a marketing footer. FOOTER-UNIFY-1 (2026-10-17):
 * until then each of these files wrote its own `<footer>` by hand and there
 * were seven different versions — the checker and `/demo` were in none, and
 * `/geo`, `/demo` and `/gratis/informe-geo` carried a five-link cut. Now each
 * renders `<PublicFooter />` and none may declare its own `<footer>`;
 * `marketing-content-links.test.ts` and `payment-badges.test.ts` walk this
 * list. It lives here, not in a test, so both tests read the same list.
 */
export const MARKETING_SHELLS: readonly string[] = [
  "components/landing/landing-page.tsx",
  "components/pricing/pricing-page.tsx",
  "components/blog/blog-page-shell.tsx",
  "components/docs/docs-page-shell.tsx",
  "components/legal-page-shell.tsx",
  "components/not-found-mission.tsx",
  "app/geo/page.tsx",
  "app/afiliados/page.tsx",
  "app/demo/page.tsx",
  "app/gratis/informe-geo/page.tsx"
];
