import { describe, expect, it } from "vitest";

import { checkStructuredData } from "@/lib/web-audit/page-checks";
import {
  ORGANIZATION_JSONLD,
  ORGANIZATION_NAME,
  ORGANIZATION_URL,
  ORGANIZATION_VISIBLE_LINE
} from "./organization-jsonld";

/**
 * El artículo sobre datos estructurados dice dos cosas de este ejemplo: que
 * cada campo repite algo que ya se ve en la página, y que la Auditoría
 * técnica lo reconoce. Se comprueban las dos, con el mismo lector del
 * producto, para que la pieza y el producto no se contradigan.
 */
describe("ejemplo de Organization del artículo sobre datos estructurados", () => {
  const json = JSON.parse(ORGANIZATION_JSONLD.replace(/<\/?script[^>]*>/g, ""));

  it("es un Organization con nombre y web", () => {
    expect(json["@type"]).toBe("Organization");
    expect(json.name).toBe(ORGANIZATION_NAME);
    expect(json.url).toBe(ORGANIZATION_URL);
  });

  it("todo lo que declara se ve también en la página", () => {
    expect(ORGANIZATION_VISIBLE_LINE).toContain(json.name);
    expect(ORGANIZATION_VISIBLE_LINE).toContain(json.address.streetAddress);
    expect(ORGANIZATION_VISIBLE_LINE).toContain(json.address.addressLocality);
    for (const profile of json.sameAs as string[]) {
      expect(ORGANIZATION_VISIBLE_LINE).toContain(`href="${profile}"`);
    }
  });

  it("la Auditoría técnica lo reconoce como dato estructurado", () => {
    const html = `<html><head>${ORGANIZATION_JSONLD}</head><body>${ORGANIZATION_VISIBLE_LINE}</body></html>`;
    const result = checkStructuredData(html);
    expect(result.pass).toBe(true);
    expect(result.matchedTypes).toEqual(["Organization"]);
  });
});
