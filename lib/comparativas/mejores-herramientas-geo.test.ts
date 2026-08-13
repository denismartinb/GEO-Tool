import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOOLS } from "./mejores-herramientas-geo";

describe("TOOLS (mejores-herramientas-geo)", () => {
  it("has at least 4 tools, including Genscore", () => {
    expect(TOOLS.length).toBeGreaterThanOrEqual(4);
    expect(TOOLS.some((t) => t.slug === "genscore")).toBe(true);
  });

  it("every tool has a unique slug", () => {
    const slugs = TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every tool has all required fields non-empty", () => {
    for (const t of TOOLS) {
      expect(t.name.length, t.slug).toBeGreaterThan(0);
      expect(t.url.length, t.slug).toBeGreaterThan(0);
      expect(t.oneLiner.length, t.slug).toBeGreaterThan(20);
      expect(t.distinctiveFeature.length, t.slug).toBeGreaterThan(20);
      expect(t.pricingNote.length, t.slug).toBeGreaterThan(0);
      expect(t.spanishSupport.length, t.slug).toBeGreaterThan(0);
      expect(t.bestFor.length, t.slug).toBeGreaterThan(20);
    }
  });

  it("every url is an absolute https url", () => {
    for (const t of TOOLS) {
      expect(t.url.startsWith("https://"), t.slug).toBe(true);
    }
  });

  it("at least two tools link to their own dedicated head-to-head comparativa", () => {
    expect(TOOLS.filter((t) => t.comparisonHref).length).toBeGreaterThanOrEqual(2);
  });

  it("Genscore itself has no comparisonHref (it doesn't compare against itself)", () => {
    expect(TOOLS.find((t) => t.slug === "genscore")?.comparisonHref).toBeUndefined();
  });
});

/**
 * SEO-POS-1 Fase C, S4 (log §66). Esta página afirmaba "**solo Genscore**"
 * tiene interfaz en español. Era cierto cuando se escribió y dejó de serlo el
 * día que CreceRank entró en la lista — sin que nada avisara, porque la
 * afirmación vivía en una cadena de texto y la lista vivía en otro fichero.
 *
 * Una exclusividad es la afirmación que más rápido caduca de una comparativa,
 * y la que más caro sale: un lector la desmiente en un clic y con ella se cae
 * la credibilidad de toda la página, incluidas las partes que sí eran
 * correctas. Así que se ata a los datos en vez de a la memoria de quien
 * escriba el próximo refresco.
 */
const pageSource = readFileSync(
  join(process.cwd(), "app", "comparativas", "mejores-herramientas-geo-en-espanol", "page.tsx"),
  "utf8"
);

describe("la página no afirma exclusividades que sus propios datos desmienten", () => {
  // `\W` y no `\b`: "í" no es carácter de palabra en ASCII, así que `/^s[íi]\b/`
  // no casa con "Sí, nativo…" ni con "Sí — producto…". La primera versión de
  // este test usaba `\b`, dejaba `speaksSpanish` vacío y se saltaba solo: pasó
  // en verde con "solo Genscore" reinsertado a propósito. Un guardián que no
  // puede fallar es peor que ninguno, porque además da por cubierto el hueco.
  const speaksSpanish = TOOLS.filter((t) => /^s[íi](\W|$)/i.test(t.spanishSupport.trim()));

  it("la lista reconoce a alguien más que a nosotros hablando español", () => {
    // Ancla el propio filtro: si un cambio de redacción vuelve a dejarlo vacío,
    // esto lo dice en vez de que el test de abajo se salte en silencio.
    expect(
      speaksSpanish.map((t) => t.slug),
      "el filtro de idioma no reconoce ninguna herramienta en español — revisa la redacción de `spanishSupport`"
    ).toContain("genscore");
  });

  it("si más de una herramienta habla español, la página no dice 'solo Genscore'", () => {
    expect(speaksSpanish.length, "el filtro se quedó vacío y el test se saltaría solo").toBeGreaterThan(0);
    if (speaksSpanish.length <= 1) return;

    expect(
      pageSource,
      `${speaksSpanish.length} herramientas de la lista declaran soporte de español ` +
        `(${speaksSpanish.map((t) => t.name).join(", ")}), así que "solo Genscore" es falso. ` +
        "Reescribe la afirmación en el mismo PR que añade la herramienta."
    ).not.toMatch(/[Ss]olo Genscore/);
  });

  it("el recuento del titular coincide con el número real de herramientas", () => {
    const match = pageSource.match(/Las (\d+) herramientas, de un vistazo/);
    expect(match, "no se encontró el titular con el recuento").not.toBeNull();
    expect(
      Number(match?.[1]),
      `el titular dice ${match?.[1]} y TOOLS tiene ${TOOLS.length}`
    ).toBe(TOOLS.length);
  });
});
