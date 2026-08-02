import type { MetadataRoute } from "next";
import { BLOG_POSTS } from "@/lib/blog/posts";
import { DOCS_NAV } from "@/lib/docs/nav";

const SITE_URL = "https://www.genscore.es";
const DOCS_LAST_MODIFIED = "2026-08-02";

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
      lastModified: new Date(DOCS_LAST_MODIFIED)
    }))
  );

  return [...staticRoutes, ...blogRoutes, ...docsRoutes];
}
