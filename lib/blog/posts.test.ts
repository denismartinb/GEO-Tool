import { describe, expect, it } from "vitest";
import { BLOG_POSTS, getBlogPost, getMetaDescription, getSeoTitle, type BlogPost } from "./posts";

const basePost: BlogPost = {
  slug: "ejemplo",
  title: "Título editorial largo y descriptivo",
  description: "Descripción editorial larga.",
  datePublished: "2026-01-01",
  coverIcon: "compass"
};

describe("getSeoTitle", () => {
  it("falls back to title when seoTitle is not set", () => {
    expect(getSeoTitle(basePost)).toBe(basePost.title);
  });

  it("uses seoTitle when set", () => {
    expect(getSeoTitle({ ...basePost, seoTitle: "Título SEO corto" })).toBe("Título SEO corto");
  });
});

describe("getMetaDescription", () => {
  it("falls back to description when metaDescription is not set", () => {
    expect(getMetaDescription(basePost)).toBe(basePost.description);
  });

  it("uses metaDescription when set", () => {
    expect(getMetaDescription({ ...basePost, metaDescription: "Meta description SEO." })).toBe(
      "Meta description SEO."
    );
  });
});

describe("BLOG_POSTS", () => {
  it("every post has a unique, non-empty primaryKeyword", () => {
    const keywords = BLOG_POSTS.map((p) => p.primaryKeyword);
    expect(keywords.every((k) => typeof k === "string" && k.length > 0)).toBe(true);
    expect(new Set(keywords).size).toBe(keywords.length);
  });

  it("getBlogPost finds an existing post and returns undefined for an unknown slug", () => {
    expect(getBlogPost(BLOG_POSTS[0].slug)?.slug).toBe(BLOG_POSTS[0].slug);
    expect(getBlogPost("no-existe")).toBeUndefined();
  });
});
