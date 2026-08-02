import type { MetadataRoute } from "next";
import { BLOG_POSTS } from "@/lib/blog/posts";

const SITE_URL = "https://www.genscore.es";

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

  return [...staticRoutes, ...blogRoutes];
}
