import type { MetadataRoute } from "next";
import { BLOG_CLUSTERS, BLOG_POSTS, type BlogCluster } from "@/lib/blog/posts";
import { DOCS_NAV } from "@/lib/docs/nav";
import { GLOSSARY_TERMS } from "@/lib/glosario/terms";

const SITE_URL = "https://www.genscore.es";
const DOCS_LAST_MODIFIED = "2026-08-02";
/**
 * Excepciones por página, cuando una sola doc cambia de verdad. Sin esto había
 * que elegir entre dejar rancia la que cambió o subir la fecha de las cinco —
 * y lo segundo le dice al rastreador que cambiaron todas, que es la señal de
 * frescura falsa que este fichero existe para no dar (mismo razonamiento que
 * `PILLAR_LAST_MODIFIED`, SEO-POS-1 T15).
 */
const DOCS_LAST_MODIFIED_BY_SLUG: Record<string, string> = {
  // Se retiró la tabla de pesos del compuesto (log §75).
  "metodologia/geo-score": "2026-08-13"
};
/**
 * GROWTH-2 Fase 2.6b: fecha del último cambio real en las entradas del
 * glosario. 2026-08-13: se retiró de `geo-score` y `citacion-en-ia` el reparto
 * de pesos del compuesto (log §75). Debe seguir a
 * `GLOSSARY_LAST_MODIFIED` de app/glosario/[termino]/page.tsx, que es la fecha
 * que se le enseña al lector — dos fechas distintas para el mismo contenido
 * son una señal de frescura que se contradice a sí misma.
 */
const GLOSSARY_LAST_MODIFIED = "2026-08-13";
/**
 * GROWTH-2 Fase 2.9: date each `/blog/<cluster>` pillar page got its real
 * `pillarIntro` and started shipping to the sitemap. Per cluster, not a
 * single shared date: `fundamentos`/`medicion`/`playbooks` earned theirs
 * together on 2026-08-03, but `sectores` stayed empty until its first article
 * on 2026-08-05 — a single constant left `sectores` two days stale from the
 * moment it entered the sitemap (SEO-POS-1, T15).
 */
const PILLAR_LAST_MODIFIED: Record<BlogCluster["key"], string> = {
  fundamentos: "2026-08-03",
  // 2026-08-14 (S8): la página pilar lista los artículos de su cluster, así
  // que publicar uno nuevo la cambia de verdad. S6 añadió `metricas-geo-que-
  // medir` sin tocar esta fecha y la dejó anunciando una frescura de once días
  // antes — el mismo tipo de rancio que T15 vino a corregir.
  medicion: "2026-08-14",
  playbooks: "2026-08-03",
  sectores: "2026-08-05"
};

/**
 * Real last-meaningful-change date per static route (GROWTH-2 Fase 2.1) —
 * previously this was `new Date()` evaluated on every sitemap request, which
 * told crawlers every route changed on every crawl and trained them to
 * ignore the freshness signal entirely. Bump the date here by hand when a
 * route's content meaningfully changes (not on every unrelated deploy).
 */
const STATIC_ROUTES: { path: string; lastModified: string }[] = [
  { path: "", lastModified: "2026-07-23" },
  { path: "/geo", lastModified: "2026-07-23" },
  { path: "/pricing", lastModified: "2026-07-23" },
  { path: "/blog", lastModified: "2026-07-12" },
  { path: "/docs", lastModified: DOCS_LAST_MODIFIED },
  { path: "/glosario", lastModified: GLOSSARY_LAST_MODIFIED },
  { path: "/comparativas", lastModified: "2026-08-03" },
  { path: "/comparativas/genscore-vs-otterly", lastModified: "2026-08-11" },
  { path: "/comparativas/genscore-vs-peec-ai", lastModified: "2026-08-11" },
  { path: "/comparativas/mejores-herramientas-geo-en-espanol", lastModified: "2026-08-12" },
  { path: "/comparativas/genscore-vs-profound", lastModified: "2026-08-11" },
  { path: "/comparativas/alternativas-a-otterly", lastModified: "2026-08-12" },
  { path: "/privacidad", lastModified: "2026-07-19" },
  { path: "/cookies", lastModified: "2026-07-12" },
  { path: "/terminos", lastModified: "2026-07-19" }
];

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = STATIC_ROUTES.map(({ path, lastModified }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(lastModified)
  }));

  const blogRoutes = BLOG_POSTS.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.datePublished)
  }));

  const docsRoutes = DOCS_NAV.flatMap((section) =>
    section.pages.map((page) => ({
      url: `${SITE_URL}/docs/${page.slug}`,
      lastModified: new Date(DOCS_LAST_MODIFIED_BY_SLUG[page.slug] ?? DOCS_LAST_MODIFIED)
    }))
  );

  const glossaryRoutes = GLOSSARY_TERMS.map((t) => ({
    url: `${SITE_URL}/glosario/${t.slug}`,
    lastModified: new Date(GLOSSARY_LAST_MODIFIED)
  }));

  // Only clusters with a real pillarIntro (i.e. real posts to synthesize). A
  // cluster with no posts keeps a stub page for direct navigation, but is not
  // submitted to crawlers as if it were real content. The filter is the whole
  // mechanism: a cluster enters the sitemap the moment it stops being empty and
  // earns a pillarIntro — "sectores" did exactly that on 2026-08-05 with its
  // first article, and nothing here had to change for it to happen.
  const pillarRoutes = BLOG_CLUSTERS.filter((c) => c.pillarIntro).map((c) => ({
    url: `${SITE_URL}/blog/${c.key}`,
    lastModified: new Date(PILLAR_LAST_MODIFIED[c.key])
  }));

  return [...staticRoutes, ...blogRoutes, ...docsRoutes, ...glossaryRoutes, ...pillarRoutes];
}
