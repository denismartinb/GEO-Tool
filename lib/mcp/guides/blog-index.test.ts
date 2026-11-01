import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOG_POSTS } from "@/lib/blog/posts";
import { GLOSSARY_TERMS } from "@/lib/glosario/terms";
// @ts-expect-error -- plain .mjs script without types
import { buildGuidesIndex, chunkPost, extractFaq } from "../../../scripts/build-guides-index.mjs";
import { buildGuideChunks } from "./corpus";

/**
 * MCP-GUIDES-1 (log §425): `buscar_guias` answers from a JSON built from the
 * blog's MDX. If a post changes and nobody regenerates it, the chat would
 * quote an old version of the article. Fix with
 * `node scripts/build-guides-index.mjs`.
 */
const root = join(__dirname, "..", "..", "..");

describe("guides index", () => {
  it("is up to date with the blog's MDX", () => {
    const stored = readFileSync(join(__dirname, "blog-index.json"), "utf8");
    expect(stored).toBe(buildGuidesIndex(join(root, "app/blog")));
  });

  it("covers every published post", () => {
    const raw = JSON.parse(readFileSync(join(__dirname, "blog-index.json"), "utf8")) as { posts: { slug: string; chunks: unknown[] }[] };
    for (const post of BLOG_POSTS) {
      const entry = raw.posts.find((p) => p.slug === post.slug);
      expect(entry, post.slug).toBeDefined();
      expect(entry!.chunks.length, post.slug).toBeGreaterThan(0);
    }
  });

  it("keeps no code, JSX or import residue in the text", () => {
    for (const c of buildGuideChunks()) {
      expect(c.text, c.path).not.toMatch(/=\{|\/>|<\/?[A-Z][A-Za-z]*|^import |from "@\//m);
    }
  });

  it("reads titles and dates from BLOG_POSTS and adds the glossary", () => {
    const chunks = buildGuideChunks();
    const post = BLOG_POSTS[0];
    expect(chunks.find((c) => c.path === `/blog/${post.slug}`)?.title).toBe(post.title);
    expect(chunks.filter((c) => c.kind === "glosario")).toHaveLength(GLOSSARY_TERMS.length);
    expect(chunks.some((c) => c.kind === "estudio")).toBe(true);
  });

  it("drops a slug that has no post (a draft folder)", () => {
    expect(buildGuideChunks({ posts: [{ slug: "borrador-sin-post", chunks: [{ section: "", text: "x" }] }] }).every((c) => c.kind === "glosario")).toBe(true);
  });

  it("turns numbered steps into headings, keeps captions and the FAQ", () => {
    const mdx = [
      'import { A } from "@/x";',
      "export const faqItems = [",
      "  {",
      '    question: "¿Sirve?",',
      '    answer:',
      '      "Sí, " +',
      '      "a veces."',
      "  }",
      "];",
      "",
      "<KeyTakeaway>",
      "",
      "Resumen **clave**.",
      "",
      "</KeyTakeaway>",
      "",
      "## Sección uno",
      "",
      '<NumberedSection n={1} title="Paso fácil">',
      "",
      "Texto del [paso](/x).",
      "",
      "</NumberedSection>",
      "",
      '<Figure caption="Una leyenda bastante larga con su fuente y fecha.">',
      '<Chart data={[{ a: 1 }]} />',
      "</Figure>"
    ].join("\n");
    expect(extractFaq(mdx)).toEqual([{ question: "¿Sirve?", answer: "Sí, a veces." }]);
    const chunks = chunkPost(mdx);
    expect(chunks[0]).toEqual({ section: "", text: "Resumen clave." });
    expect(chunks[1].section).toBe("Sección uno");
    expect(chunks[1].text).toContain("Paso fácil:");
    expect(chunks[1].text).toContain("Texto del paso.");
    expect(chunks[1].text).toContain("Una leyenda bastante larga con su fuente y fecha.");
    expect(chunks.at(-1)).toEqual({ section: "¿Sirve?", text: "Sí, a veces." });
  });
});
