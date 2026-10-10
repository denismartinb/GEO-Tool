import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrganizationSchema } from "./organization-schema";
import { CANONICAL_DEFINITION, ORGANIZATION_ID } from "@/lib/brand/canonical-definition";

/**
 * GEO-SELF-1 Fase 1. El nodo `Organization` es al que apuntan por `@id` el
 * `SoftwareApplication`, los artículos y `/sobre-genscore`: lo que le falte
 * aquí le falta a todos. Y lo que no debe tener —un fundador con nombre, una
 * persona— no puede colarse por aquí sin que esto salte.
 */
function json(): Record<string, unknown> {
  const html = renderToStaticMarkup(OrganizationSchema());
  const match = html.match(/<script[^>]*>(.*)<\/script>/s);
  if (!match) throw new Error("sin JSON-LD");
  return JSON.parse(match[1]);
}

describe("OrganizationSchema", () => {
  it("se describe con la definición canónica, no con una redacción propia", () => {
    expect(json().description).toBe(CANONICAL_DEFINITION);
    expect(json()["@id"]).toBe(ORGANIZATION_ID);
  });

  it("declara un logo raster (Google no acepta SVG como logo de organización)", () => {
    const logo = json().logo as Record<string, unknown>;
    expect(String(logo.url)).toMatch(/\.png$/);
  });

  it("declara año de fundación, España y la categoría", () => {
    const org = json();
    expect(org.foundingDate).toBe("2026");
    expect(JSON.stringify(org.areaServed)).toContain("España");
    expect(org.knowsAbout).toContain("Generative Engine Optimization");
  });

  it("no declara fundador ni persona alguna", () => {
    const org = json();
    expect(org.founder).toBeUndefined();
    expect(org.founders).toBeUndefined();
    expect(JSON.stringify(org)).not.toContain("Person");
  });

  it("mantiene los perfiles reales en sameAs", () => {
    expect(json().sameAs).toEqual([
      "https://www.linkedin.com/company/genscore/",
      "https://www.g2.com/sellers/genscore"
    ]);
  });
});
