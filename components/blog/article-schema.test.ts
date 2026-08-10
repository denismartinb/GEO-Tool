import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArticleSchema } from "./article-schema";

/**
 * SEO-POS-1 (T9). `dateModified` debía valer siempre `datePublished` porque
 * `ArticleSchema` no tenía forma de saber si un artículo se había refrescado
 * de verdad. Este test fija el contrato del prop nuevo: sin `dateUpdated`, el
 * comportamiento es exactamente el de antes.
 */
function jsonFrom(html: string): Record<string, unknown> {
  const match = html.match(/<script[^>]*>(.*)<\/script>/s);
  if (!match) throw new Error("no se encontró el <script> con el JSON-LD");
  return JSON.parse(match[1]);
}

describe("ArticleSchema", () => {
  const base = {
    title: "Título",
    description: "Descripción",
    slug: "titulo",
    datePublished: "2026-07-01"
  };

  it("sin dateUpdated, dateModified cae a datePublished", () => {
    const json = jsonFrom(renderToStaticMarkup(ArticleSchema(base)));
    expect(json.datePublished).toBe("2026-07-01");
    expect(json.dateModified).toBe("2026-07-01");
  });

  it("con dateUpdated, dateModified usa la fecha real de refresco", () => {
    const json = jsonFrom(renderToStaticMarkup(ArticleSchema({ ...base, dateUpdated: "2026-08-10" })));
    expect(json.datePublished).toBe("2026-07-01");
    expect(json.dateModified).toBe("2026-08-10");
  });

  it("sin coverImage, no declara image (no inventa una URL rota)", () => {
    const json = jsonFrom(renderToStaticMarkup(ArticleSchema(base)));
    expect(json.image).toBeUndefined();
  });

  it("con coverImage, la resuelve a URL absoluta", () => {
    const json = jsonFrom(
      renderToStaticMarkup(ArticleSchema({ ...base, coverImage: "/blog/titulo/cover.webp" }))
    );
    expect(json.image).toBe("https://www.genscore.es/blog/titulo/cover.webp");
  });
});
