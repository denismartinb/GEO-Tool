import { describe, expect, it } from "vitest";
import { buildRssFeed } from "./rss";
import type { BlogPost } from "./posts";

const posts: BlogPost[] = [
  {
    slug: "primero",
    title: "El primero & <especial>",
    description: "Descripción \"con comillas\".",
    datePublished: "2026-01-01",
    coverIcon: "compass"
  },
  {
    slug: "segundo",
    title: "El segundo",
    description: "Otra descripción.",
    datePublished: "2026-06-01",
    coverIcon: "target",
    metaDescription: "Meta description específica."
  }
];

describe("buildRssFeed", () => {
  it("produces a well-formed RSS 2.0 document", () => {
    const xml = buildRssFeed(posts);
    expect(xml.startsWith("<?xml")).toBe(true);
    expect(xml).toContain("<rss version=\"2.0\">");
    expect(xml).toContain("<link>https://www.genscore.es/blog</link>");
  });

  it("orders items by publish date, most recent first", () => {
    const xml = buildRssFeed(posts);
    expect(xml.indexOf("segundo")).toBeLessThan(xml.indexOf("primero"));
  });

  it("escapes XML-unsafe characters in title and description", () => {
    const xml = buildRssFeed(posts);
    expect(xml).toContain("El primero &amp; &lt;especial&gt;");
    expect(xml).not.toContain("El primero & <especial>");
  });

  it("uses metaDescription when present, otherwise falls back to description", () => {
    const xml = buildRssFeed(posts);
    expect(xml).toContain("Meta description específica.");
    expect(xml).toContain("Descripción &quot;con comillas&quot;.");
  });

  it("links each item to its canonical blog URL", () => {
    const xml = buildRssFeed(posts);
    expect(xml).toContain("<link>https://www.genscore.es/blog/primero</link>");
    expect(xml).toContain("<link>https://www.genscore.es/blog/segundo</link>");
  });
});
