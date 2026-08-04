import { describe, expect, it } from "vitest";
import {
  BLOG_CLUSTERS,
  BLOG_POSTS,
  getBlogCluster,
  getBlogPost,
  getMetaDescription,
  getPostsByCluster,
  getSeoTitle,
  type BlogPost
} from "./posts";

const basePost: BlogPost = {
  slug: "ejemplo",
  title: "Título editorial largo y descriptivo",
  description: "Descripción editorial larga.",
  datePublished: "2026-01-01",
  coverIcon: "compass",
  cluster: "fundamentos"
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

  it("every post's cluster is a real key in BLOG_CLUSTERS", () => {
    const validKeys = new Set(BLOG_CLUSTERS.map((c) => c.key));
    for (const post of BLOG_POSTS) {
      expect(validKeys.has(post.cluster), `${post.slug} has an unknown cluster "${post.cluster}"`).toBe(true);
    }
  });
});

describe("getPostsByCluster", () => {
  it("returns only posts belonging to the requested cluster", () => {
    for (const cluster of BLOG_CLUSTERS) {
      const posts = getPostsByCluster(cluster.key);
      expect(posts.every((p) => p.cluster === cluster.key)).toBe(true);
    }
  });

  it("returns an empty array for a cluster with no posts yet", () => {
    expect(getPostsByCluster("sectores")).toEqual([]);
  });

  it("every post is reachable from exactly one cluster (no post is orphaned)", () => {
    const total = BLOG_CLUSTERS.reduce((sum, c) => sum + getPostsByCluster(c.key).length, 0);
    expect(total).toBe(BLOG_POSTS.length);
  });
});

describe("getBlogCluster", () => {
  it("finds an existing cluster and returns undefined for an unknown key", () => {
    expect(getBlogCluster("fundamentos")?.key).toBe("fundamentos");
    // @ts-expect-error deliberately invalid key to prove the lookup is safe
    expect(getBlogCluster("no-existe")).toBeUndefined();
  });
});

describe("BLOG_CLUSTERS pillarIntro (GROWTH-2 Fase 2.9, B1b)", () => {
  it("every cluster with at least one real post has a pillarIntro", () => {
    for (const cluster of BLOG_CLUSTERS) {
      const hasPosts = getPostsByCluster(cluster.key).length > 0;
      if (hasPosts) {
        expect(cluster.pillarIntro, `${cluster.key} has posts but no pillarIntro`).toBeTruthy();
      }
    }
  });

  it("'sectores' has no pillarIntro — it has zero real posts, nothing to synthesize honestly yet", () => {
    expect(getBlogCluster("sectores")?.pillarIntro).toBeUndefined();
  });
});
