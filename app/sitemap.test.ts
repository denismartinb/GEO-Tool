import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";
import { BLOG_POSTS } from "@/lib/blog/posts";

describe("sitemap", () => {
  it("gives every static route a fixed date string, not the current request time", () => {
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

  it("calling sitemap() twice returns identical dates (no time-of-request drift)", () => {
    const first = sitemap();
    const second = sitemap();
    expect(first.map((e) => (e.lastModified as Date).toISOString())).toEqual(
      second.map((e) => (e.lastModified as Date).toISOString())
    );
  });
});
