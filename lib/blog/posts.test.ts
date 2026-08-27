import { describe, expect, it } from "vitest";
import {
  BLOG_CLUSTERS,
  BLOG_POSTS,
  blogPostMetadata,
  getBlogCluster,
  getBlogPost,
  getMetaDescription,
  getMostRecentPost,
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

  it("returns an empty array for a cluster key with no posts", () => {
    // Ya no queda ningún cluster real vacío: "sectores" se abrió con
    // `geo-para-ecommerce` (GROWTH-3, primera pieza de la cola semanal), y era
    // el último que quedaba sin artículos. La función tiene que seguir
    // devolviendo [] sin romperse para una clave que no case con nada, que es
    // la propiedad que este test protege — no que un cluster concreto esté
    // vacío, porque eso caduca en cuanto se publica su primer artículo.
    expect(getPostsByCluster("cluster-inexistente" as never)).toEqual([]);
  });

  it("every post is reachable from exactly one cluster (no post is orphaned)", () => {
    const total = BLOG_CLUSTERS.reduce((sum, c) => sum + getPostsByCluster(c.key).length, 0);
    expect(total).toBe(BLOG_POSTS.length);
  });
});

describe("getMostRecentPost", () => {
  it("devuelve el post real con datePublished más alto de BLOG_POSTS", () => {
    const expected = [...BLOG_POSTS].sort((a, b) => (a.datePublished > b.datePublished ? -1 : 1))[0];
    expect(getMostRecentPost().slug).toBe(expected.slug);
  });

  it("no muta BLOG_POSTS al ordenar", () => {
    const before = BLOG_POSTS.map((p) => p.slug);
    getMostRecentPost();
    expect(BLOG_POSTS.map((p) => p.slug)).toEqual(before);
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

  it("'sectores' now has a pillarIntro — it stopped being empty when its first post shipped", () => {
    // Este test decía lo contrario hasta GROWTH-3: `sectores` no tenía
    // pillarIntro *a propósito*, porque sin artículos no había nada que
    // sintetizar honestamente y un pilar de relleno es peor que un estado
    // vacío. `geo-para-ecommerce` lo abrió, así que la condición que lo
    // justificaba ya no se cumple. La regla de fondo no cambia y sigue
    // vigilada por el test de arriba: un cluster con posts reales necesita
    // pilar; uno vacío no debe fingir que lo tiene.
    expect(getBlogCluster("sectores")?.pillarIntro).toBeTruthy();
  });
});

describe("blogPostMetadata dateUpdated (SEO-POS-1, T9)", () => {
  it("sin dateUpdated, no declara modifiedTime — igual que antes de que el campo existiera", () => {
    const og = blogPostMetadata(basePost).openGraph as { modifiedTime?: string } | undefined;
    expect(og?.modifiedTime).toBeUndefined();
  });

  it("con dateUpdated, lo propaga como modifiedTime del artículo", () => {
    const post = { ...basePost, dateUpdated: "2026-08-10" };
    const og = blogPostMetadata(post).openGraph as { modifiedTime?: string } | undefined;
    expect(og?.modifiedTime).toBe("2026-08-10");
  });

  /**
   * Refrescos reales, con su justificación. Hasta el 2026-08-13 este test
   * exigía que NINGÚN post tuviera `dateUpdated`: no había ocurrido ningún
   * refresco todavía y la tubería estaba recién puesta (T-c). El primero llegó
   * con S6 y la lista sustituye a la prohibición, conservando lo que el test
   * protegía de verdad — que nadie suba una fecha sin tocar el artículo
   * (content-strategy.md §4.4: "nunca solo la fecha").
   *
   * Añadir una entrada aquí es parte del PR que hace el refresco, no un
   * trámite posterior: si el cuerpo del artículo no cambió, no es un refresco.
   */
  const REFRESCOS_REALES: Record<string, string> = {
    "que-es-el-geo-score":
      "GEO-SCORE-V4 (ADR 0033) añadió el componente técnico y reescaló los pesos; " +
      "el artículo seguía publicando los cuatro de v2. Refrescado en SEO-POS-1 S6, log §72."
  };

  it("todo dateUpdated corresponde a un refresco documentado", () => {
    const sinJustificar = BLOG_POSTS.filter((post) => post.dateUpdated && !REFRESCOS_REALES[post.slug]).map(
      (post) => post.slug
    );
    expect(
      sinJustificar,
      `estos posts declaran dateUpdated sin refresco documentado: ${sinJustificar.join(", ")}. ` +
        "Un refresco cambia un dato, un ejemplo o una sección — nunca solo la fecha."
    ).toEqual([]);
  });

  it("no se documenta un refresco de un post que no lo declara", () => {
    for (const slug of Object.keys(REFRESCOS_REALES)) {
      const post = BLOG_POSTS.find((p) => p.slug === slug);
      expect(post, `${slug} está documentado como refrescado pero no existe`).toBeTruthy();
      expect(post?.dateUpdated, `${slug} está documentado como refrescado pero no declara dateUpdated`).toBeTruthy();
    }
  });
});
