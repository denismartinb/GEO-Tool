import { describe, expect, it } from "vitest";
import { BLOG_POSTS } from "@/lib/blog/posts";
import { homeBlogStrip } from "@/lib/landing/home-blog";

describe("homeBlogStrip (HOME-2026-08, tira «Aprender» de la portada)", () => {
  const tira = homeBlogStrip();

  it("apunta a artículos que existen de verdad", () => {
    // Es el motivo entero de que la tira se calcule en vez de escribirse: un
    // slug a mano sobrevive al artículo que nombra y deja un 404 en la página
    // que más tráfico recibe.
    for (const card of tira) {
      expect(BLOG_POSTS.some((p) => p.slug === card.slug), `${card.slug} no existe`).toBe(true);
    }
  });

  it("trae un artículo por cluster, sin repetir", () => {
    const slugs = tira.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(tira.map((c) => c.cluster)).toEqual([
      "Fundamentos GEO",
      "Playbooks de ejecución",
      "Metodología y medición"
    ]);
  });

  it("elige el más reciente de cada cluster", () => {
    for (const card of tira) {
      const post = BLOG_POSTS.find((p) => p.slug === card.slug)!;
      const hermanos = BLOG_POSTS.filter((p) => p.cluster === post.cluster);
      const masReciente = hermanos.every((p) => p.datePublished <= post.datePublished);
      expect(masReciente, `${card.slug} no es el más reciente de ${post.cluster}`).toBe(true);
    }
  });

  it("no adelanta ni retrasa la fecha publicada", () => {
    // `new Date("2026-08-15")` es medianoche UTC, pero se formatea en la zona
    // del proceso: en cualquier zona al oeste de Londres el día retrocede uno.
    // Por eso el módulo añade `T00:00:00Z` y formatea en UTC.
    for (const card of tira) {
      const post = BLOG_POSTS.find((p) => p.slug === card.slug)!;
      const dia = Number(post.datePublished.slice(8, 10));
      expect(card.fecha.startsWith(`${dia} de `), `${card.fecha} ≠ ${post.datePublished}`).toBe(true);
      expect(card.fecha).toContain(post.datePublished.slice(0, 4));
    }
  });

  it("no publica tiempo de lectura, porque el producto no lo calcula", () => {
    // El artboard pone «7 min de lectura» en las tres tarjetas. `BlogPost` no
    // tiene ese campo y el índice del blog enseña la fecha: publicarlo sería
    // inventar una cifra (CLAUDE.md, "no fake metrics").
    for (const card of tira) {
      expect(JSON.stringify(card)).not.toMatch(/min de lectura|minutos/i);
    }
  });
});
