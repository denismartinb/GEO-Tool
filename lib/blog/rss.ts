import { BLOG_POSTS, getMetaDescription, type BlogPost } from "@/lib/blog/posts";

const SITE_URL = "https://www.genscore.es";
const FEED_TITLE = "Genscore — Blog";
const FEED_DESCRIPTION = "GEO (Generative Engine Optimization): metodología, guías y análisis sobre cómo aparecen las marcas en respuestas de IA.";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRfc822(isoDate: string): string {
  return new Date(isoDate).toUTCString();
}

function itemXml(post: BlogPost): string {
  const url = `${SITE_URL}/blog/${post.slug}`;
  return `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${toRfc822(post.datePublished)}</pubDate>
      <description>${escapeXml(getMetaDescription(post))}</description>
    </item>`;
}

/**
 * Pure RSS 2.0 builder (GROWTH-2 Fase 2.1) — kept separate from the route
 * handler so the XML shape is unit-testable without spinning up a Next.js
 * request/response cycle.
 */
export function buildRssFeed(posts: BlogPost[] = BLOG_POSTS): string {
  const sorted = [...posts].sort((a, b) => b.datePublished.localeCompare(a.datePublished));
  const latestPubDate = sorted[0] ? toRfc822(sorted[0].datePublished) : toRfc822(new Date(0).toISOString());

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(FEED_TITLE)}</title>
    <link>${SITE_URL}/blog</link>
    <description>${escapeXml(FEED_DESCRIPTION)}</description>
    <language>es-ES</language>
    <lastBuildDate>${latestPubDate}</lastBuildDate>
    <atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
    ${sorted.map(itemXml).join("")}
  </channel>
</rss>`;
}
