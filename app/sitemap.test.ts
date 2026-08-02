import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";
import { BLOG_POSTS } from "@/lib/blog/posts";

describe("sitemap", () => {
  it("gives every static route a fixed real date, not the current request time", () => {
    const entries = sitemap();
    const now = new Date();
    const staticEntries = entries.slice(0, entries.length - BLOG_POSTS.length);

    expect(staticEntries.length).toBeGreaterThan(0);
    for (const entry of staticEntries) {
      const lastModified = entry.lastModified as Date;
      // A real historical date is always at least a day before "now" — this
      // is what would fail if lastModified were `new Date()` evaluated at
      // request time (GROWTH-2 Fase 2.1 regression guard).
      expect(now.getTime() - lastModified.getTime()).toBeGreaterThan(24 * 60 * 60 * 1000);
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

  it("calling sitemap() twice returns identical dates (no time-of-request drift)", () => {
    const first = sitemap();
    const second = sitemap();
    expect(first.map((e) => (e.lastModified as Date).toISOString())).toEqual(
      second.map((e) => (e.lastModified as Date).toISOString())
    );
  });
});
