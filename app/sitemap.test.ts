import { studiesLastModified } from "@/lib/estudios/studies";
import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";
import { BLOG_POSTS, BLOG_CLUSTERS } from "@/lib/blog/posts";
import { DOCS_NAV } from "@/lib/docs/nav";
import { latestPostDate, postLastModified } from "@/lib/seo/sitemap-dates";

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

  it("includes every blog post with its real last-change date (refresh if any, else publication)", () => {
    const entries = sitemap();
    for (const post of BLOG_POSTS) {
      const entry = entries.find((e) => e.url === `https://www.genscore.es/blog/${post.slug}`);
      expect(entry).toBeDefined();
      expect((entry!.lastModified as Date).toISOString().slice(0, 10)).toBe(post.dateUpdated ?? post.datePublished);
    }
  });

  it("a refreshed post declares its refresh date, not its publication date (GEO-SELF-1)", () => {
    const refreshed = BLOG_POSTS.find((p) => p.dateUpdated && p.dateUpdated !== p.datePublished);
    expect(refreshed, "no queda ningún artículo refrescado con el que probar esto").toBeDefined();
    const entry = sitemap().find((e) => e.url === `https://www.genscore.es/blog/${refreshed!.slug}`);
    expect((entry!.lastModified as Date).toISOString().slice(0, 10)).toBe(refreshed!.dateUpdated);
  });

  it("/blog declares the latest change among its posts, not a hand-kept date (GEO-SELF-1)", () => {
    const latest = latestPostDate(BLOG_POSTS)!;
    const entry = sitemap().find((e) => e.url === "https://www.genscore.es/blog");
    expect((entry!.lastModified as Date).toISOString().slice(0, 10)).toBe(latest);
    for (const post of BLOG_POSTS) {
      expect(postLastModified(post) <= latest).toBe(true);
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

  it("each pillar declares the latest change among ITS OWN posts, not a shared date (SEO-POS-1 T15, GEO-SELF-1)", () => {
    // Regresión de T15: una sola constante compartida dejaba a `sectores` dos
    // días rancio. GEO-SELF-1 la deriva de los posts del cluster, que es lo
    // que la página pilar lista de verdad.
    const entries = sitemap();
    for (const cluster of BLOG_CLUSTERS.filter((c) => c.pillarIntro)) {
      const entry = entries.find((e) => e.url === `https://www.genscore.es/blog/${cluster.key}`);
      const expected = latestPostDate(BLOG_POSTS.filter((p) => p.cluster === cluster.key));
      expect(expected, `${cluster.key} no tiene artículos`).toBeDefined();
      expect((entry!.lastModified as Date).toISOString().slice(0, 10), cluster.key).toBe(expected);
    }
  });

  it("latestPostDate prefers dateUpdated and returns undefined for an empty list", () => {
    expect(latestPostDate([])).toBeUndefined();
    expect(
      latestPostDate([
        { datePublished: "2026-07-01", dateUpdated: "2026-09-01" },
        { datePublished: "2026-08-15" }
      ])
    ).toBe("2026-09-01");
  });

  it("includes /estudios with the date of its newest study (GEO-SELF-1 Fase 4)", () => {
    const entry = sitemap().find((e) => e.url === "https://www.genscore.es/estudios");
    expect(entry).toBeDefined();
    expect(new Date(entry!.lastModified as string | Date).toISOString().slice(0, 10)).toBe(studiesLastModified());
  });

  it("includes /sobre-genscore (GEO-SELF-1)", () => {
    expect(sitemap().some((e) => e.url === "https://www.genscore.es/sobre-genscore")).toBe(true);
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
