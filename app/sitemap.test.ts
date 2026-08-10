import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";
import { BLOG_POSTS, BLOG_CLUSTERS } from "@/lib/blog/posts";
import { DOCS_NAV } from "@/lib/docs/nav";

describe("sitemap", () => {
  it("gives every static and docs route a fixed date string, not the current request time", () => {
    const entries = sitemap();
    const blogUrls = new Set(BLOG_POSTS.map((post) => `https://www.genscore.es/blog/${post.slug}`));
    const staticEntries = entries.filter((e) => !blogUrls.has(e.url));

    expect(staticEntries.length).toBeGreaterThan(0);
    for (const entry of staticEntries) {
      const lastModified = entry.lastModified as Date;
      // `new Date("YYYY-MM-DD")` always parses to exact UTC midnight;
      // `new Date()` evaluated live essentially never does. Checking for
      // midnight (rather than "is in the past") is what actually catches a
      // route regressing to request-time `new Date()` even on the same day
      // its hardcoded date is bumped (GROWTH-2 Fase 2.1 regression guard).
      expect(lastModified.getUTCHours(), `${entry.url}: not UTC midnight`).toBe(0);
      expect(lastModified.getUTCMinutes(), `${entry.url}: not UTC midnight`).toBe(0);
      expect(lastModified.getUTCSeconds(), `${entry.url}: not UTC midnight`).toBe(0);
      expect(lastModified.getUTCMilliseconds(), `${entry.url}: not UTC midnight`).toBe(0);
    }
  });

  it("includes every blog post with its real published date", () => {
    const entries = sitemap();
    for (const post of BLOG_POSTS) {
      const entry = entries.find((e) => e.url === `https://www.genscore.es/blog/${post.slug}`);
      expect(entry).toBeDefined();
      expect((entry!.lastModified as Date).toISOString().slice(0, 10)).toBe(post.datePublished);
    }
  });

  it("includes every /docs page from DOCS_NAV", () => {
    const entries = sitemap();
    const urls = new Set(entries.map((e) => e.url));
    for (const section of DOCS_NAV) {
      for (const docPage of section.pages) {
        expect(urls.has(`https://www.genscore.es/docs/${docPage.slug}`)).toBe(true);
      }
    }
  });

  it("gives 'sectores' its own pillar date, not the one shared by the other clusters (SEO-POS-1, T15)", () => {
    // Regresión concreta: fundamentos/medicion/playbooks ganaron su
    // pillarIntro el mismo día (2026-08-03); sectores no tuvo la suya hasta
    // su primer artículo, dos días después (2026-08-05). Una sola constante
    // compartida dejaba a sectores dos días rancio desde el momento en que
    // entró en el sitemap.
    const entries = sitemap();
    const sectoresEntry = entries.find((e) => e.url === "https://www.genscore.es/blog/sectores");
    const fundamentosEntry = entries.find((e) => e.url === "https://www.genscore.es/blog/fundamentos");
    expect(sectoresEntry).toBeDefined();
    expect(fundamentosEntry).toBeDefined();
    expect((sectoresEntry!.lastModified as Date).toISOString().slice(0, 10)).toBe("2026-08-05");
    expect((fundamentosEntry!.lastModified as Date).toISOString().slice(0, 10)).toBe("2026-08-03");
  });

  it("every cluster with a real pillarIntro has its own sitemap date", () => {
    const entries = sitemap();
    const urls = new Set(entries.map((e) => e.url));
    for (const cluster of BLOG_CLUSTERS.filter((c) => c.pillarIntro)) {
      expect(urls.has(`https://www.genscore.es/blog/${cluster.key}`), `falta ${cluster.key} en el sitemap`).toBe(
        true
      );
    }
  });

  it("calling sitemap() twice returns identical dates (no time-of-request drift)", () => {
    const first = sitemap();
    const second = sitemap();
    expect(first.map((e) => (e.lastModified as Date).toISOString())).toEqual(
      second.map((e) => (e.lastModified as Date).toISOString())
    );
  });
});
