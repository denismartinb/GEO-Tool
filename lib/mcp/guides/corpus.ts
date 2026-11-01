import { BLOG_POSTS } from "@/lib/blog/posts";
import { getStudies } from "@/lib/estudios/studies";
import { GLOSSARY_TERMS } from "@/lib/glosario/terms";
import blogIndex from "./blog-index.json";
import { buildIndex, type GuideChunk, type GuideIndex } from "./search";

/**
 * MCP-GUIDES-1 (log §425): what `buscar_guias` searches. The article text
 * comes from `blog-index.json` (generated from the MDX by
 * `scripts/build-guides-index.mjs`); title, date and kind are read here from
 * `BLOG_POSTS` and `getStudies`, the same owners as the blog and `/estudios`.
 * A slug in the JSON with no post (a draft folder) is left out. Glossary
 * entries are read straight from `GLOSSARY_TERMS`.
 */
type RawIndex = { posts: Array<{ slug: string; chunks: Array<{ section: string; text: string }> }> };

export function buildGuideChunks(raw: RawIndex = blogIndex as RawIndex): GuideChunk[] {
  const studies = new Set(getStudies().map((s) => s.post.slug));
  const chunks: GuideChunk[] = [];
  for (const entry of raw.posts) {
    const post = BLOG_POSTS.find((p) => p.slug === entry.slug);
    if (!post) continue;
    for (const c of entry.chunks) {
      chunks.push({
        path: `/blog/${post.slug}`,
        title: post.title,
        section: c.section,
        text: c.text,
        kind: studies.has(post.slug) ? "estudio" : "guia",
        date: post.dateUpdated ?? post.datePublished
      });
    }
  }
  for (const t of GLOSSARY_TERMS) {
    chunks.push({ path: `/glosario/${t.slug}`, title: t.term, section: "", text: t.longDefinition, kind: "glosario", date: null });
  }
  return chunks;
}

let cached: GuideIndex | null = null;

/** Built once per server instance, on the first search. */
export function guideIndex(): GuideIndex {
  cached ??= buildIndex(buildGuideChunks());
  return cached;
}
