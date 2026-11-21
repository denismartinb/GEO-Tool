import { describe, expect, it } from "vitest";

import { checkFreshness } from "@/lib/web-audit/page-checks";
import {
  ARTICLE_DATES_JSONLD,
  ARTICLE_DATES_MODIFIED,
  ARTICLE_DATES_PUBLISHED,
  ARTICLE_DATES_VISIBLE_LINE
} from "./article-dates-jsonld";

/**
 * El artículo sobre contenido reciente dice que estas dos fechas son las que
 * lee la Auditoría técnica para «Contenido actualizado». Se comprueba con el
 * mismo lector, para que la pieza y el producto no se contradigan.
 */
describe("fechas de ejemplo del artículo sobre contenido reciente", () => {
  const json = JSON.parse(ARTICLE_DATES_JSONLD.replace(/<\/?script[^>]*>/g, ""));

  it("es un Article con las dos fechas, y la de actualización no es anterior", () => {
    expect(json["@type"]).toBe("Article");
    expect(json.datePublished).toBe(ARTICLE_DATES_PUBLISHED);
    expect(json.dateModified).toBe(ARTICLE_DATES_MODIFIED);
    expect(json.dateModified >= json.datePublished).toBe(true);
  });

  it("la línea visible enseña las mismas fechas que el JSON-LD", () => {
    expect(ARTICLE_DATES_VISIBLE_LINE).toContain(`datetime="${ARTICLE_DATES_PUBLISHED}"`);
    expect(ARTICLE_DATES_VISIBLE_LINE).toContain(`datetime="${ARTICLE_DATES_MODIFIED}"`);
  });

  it("la Auditoría técnica lee la fecha de actualización, no la de publicación", () => {
    const html = `<html><head>${ARTICLE_DATES_JSONLD}</head><body>${ARTICLE_DATES_VISIBLE_LINE}</body></html>`;
    const result = checkFreshness(html, new Date("2026-10-26T00:00:00Z"));
    expect(result.status).toBe("fresh");
    expect(result.date?.slice(0, 10)).toBe(ARTICLE_DATES_MODIFIED);
  });
});
