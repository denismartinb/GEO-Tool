import { describe, expect, it } from "vitest";
import { contentMetadata, ogImageFor, DEFAULT_OG_IMAGE, SITE_URL } from "./metadata";
import { BLOG_POSTS, blogPostMetadata } from "@/lib/blog/posts";

/**
 * SEO-POS-1 (T5). Tres fallos reales que estos tests fijan, los tres
 * encontrados durante la propia implementación:
 *
 * 1. El `openGraph` de una página REEMPLAZA el del layout raíz en Next; no se
 *    fusiona. Declarar solo título y descripción deja la página sin `og:image`.
 * 2. Un `og:image` en SVG da una tarjeta en blanco: ninguna red social lo
 *    renderiza. Tres portadas del blog son SVG.
 * 3. Las portadas PNG reales son cuadradas de 1254×1254, así que declararlas
 *    1200×630 era describir mal el activo.
 */

describe("contentMetadata", () => {
  const meta = contentMetadata({
    title: "Título",
    description: "Descripción",
    path: "/ruta"
  });

  it("siempre emite un openGraph completo, no un fragmento", () => {
    const og = meta.openGraph;
    expect(og?.title).toBe("Título");
    expect(og?.url).toBe(`${SITE_URL}/ruta`);
    expect(og && "siteName" in og ? og.siteName : undefined).toBe("GenScore");
    expect(og?.images).toBeTruthy();
    expect(og?.locale).toBe("es_ES");
  });

  it("emite tarjeta de Twitter con imagen", () => {
    // `Twitter` es una unión discriminada por `card`, así que TS no deja leer
    // la propiedad sin estrechar antes.
    expect((meta.twitter as { card?: string } | undefined)?.card).toBe("summary_large_image");
    expect(meta.twitter?.images).toBeTruthy();
  });

  it("canoniza la home sin barra final", () => {
    expect(contentMetadata({ title: "t", description: "d", path: "" }).alternates?.canonical).toBe(
      SITE_URL
    );
  });

  it("solo declara el RSS cuando se pide", () => {
    expect(meta.alternates?.types).toBeUndefined();
    const withRss = contentMetadata({ title: "t", description: "d", path: "/blog", rss: true });
    expect(withRss.alternates?.types?.["application/rss+xml"]).toBe(`${SITE_URL}/feed.xml`);
  });
});

describe("ogImageFor", () => {
  it("acepta portadas rasterizadas", () => {
    expect(ogImageFor("/blog/x/cover.png").url).toBe("/blog/x/cover.png");
  });

  it("rechaza SVG y cae a la imagen de marca", () => {
    expect(ogImageFor("/blog/x/cover.svg")).toEqual(DEFAULT_OG_IMAGE);
  });

  it("cae a la imagen de marca cuando no hay portada", () => {
    expect(ogImageFor(undefined)).toEqual(DEFAULT_OG_IMAGE);
  });

  it("no inventa medidas para una portada cuyo tamaño no conoce", () => {
    expect(ogImageFor("/blog/x/cover.png").width).toBeUndefined();
  });
});

describe("blogPostMetadata", () => {
  it("da a cada artículo publicado su propio título y canonical", () => {
    const titles = new Set<string>();
    for (const post of BLOG_POSTS) {
      const meta = blogPostMetadata(post);
      expect(meta.alternates?.canonical).toBe(`${SITE_URL}/blog/${post.slug}`);
      expect(String(meta.title)).not.toBe("GenScore");
      titles.add(String(meta.title));
    }
    // Títulos duplicados = canibalización entre artículos.
    expect(titles.size).toBe(BLOG_POSTS.length);
  });

  it("nunca deja un artículo sin imagen de tarjeta utilizable", () => {
    for (const post of BLOG_POSTS) {
      const images = blogPostMetadata(post).openGraph?.images;
      const first = Array.isArray(images) ? images[0] : images;
      const url = typeof first === "string" ? first : (first as { url: string }).url;
      expect(url, `${post.slug} sin imagen`).toBeTruthy();
      expect(url, `${post.slug} usa un SVG como og:image`).not.toMatch(/\.svg$/i);
    }
  });

  it("marca los artículos como article, no como website", () => {
    const og = blogPostMetadata(BLOG_POSTS[0]).openGraph as { type?: string } | undefined;
    expect(og?.type).toBe("article");
  });
});
