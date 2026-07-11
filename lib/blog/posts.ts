/**
 * Single source of truth for blog post metadata (GROWTH-1 Fase 7a) — used by
 * the index page, the sitemap, and each post's own <title>/description/JSON-LD
 * (via ArticleSchema), so the same title/description/date never has to be
 * typed out in more than one place. Adding a post = one entry here + one new
 * app/blog/<slug>/page.mdx file.
 */
export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  datePublished: string; // ISO date, e.g. "2026-07-12"
  /** Icon name (components/ui/icon.tsx) shown on the post's abstract gradient cover (components/blog/blog-cover.tsx) — no stock photography. */
  coverIcon: string;
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "que-es-el-geo-score",
    title: "Qué es el GEO Score y cómo se calcula",
    description:
      "La metodología detrás del GEO Score de GenScore: qué mide, cómo se combina presencia, prominencia, posición competitiva y autoridad, y por qué importa para saber cómo aparece tu marca en respuestas de IA.",
    datePublished: "2026-07-12",
    coverIcon: "trendUp"
  }
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
