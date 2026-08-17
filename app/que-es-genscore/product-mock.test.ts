import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SEO-POS-1 Fase E, E2 (revisión del fundador, log §95).
 *
 * `/que-es-genscore` enseña una maqueta del panel de GEO Score con su gauge y
 * sus cinco componentes. `article-recipes.test.ts` ya comprueba esa coherencia
 * —que el número del gauge sea la media ponderada real de las barras que se
 * ven— pero **sólo sobre `app/blog/<slug>/page.mdx`**, y esta página es un
 * `.tsx` fuera del blog. Sin este test, la maqueta más visible del sitio es
 * justo la que nadie verifica.
 *
 * El fallo que evita no es hipotético: el comentario de `MockRow` en
 * `components/blog/article/figure.tsx` dice que una maqueta ya se contradijo a
 * sí misma a la vista del lector dos veces. Un panel que enseña cinco barras y
 * un número que no sale de ellas es una captura falsa de nuestro propio
 * producto, en la página que existe para explicar qué es el producto.
 */
const source = readFileSync(join(process.cwd(), "app", "que-es-genscore", "page.tsx"), "utf8");

function parseMockRows(): { value: number; weight: number }[] {
  const rows = [...source.matchAll(/value:\s*(\d+),\s*weight:\s*(\d+)/g)];
  return rows.map((m) => ({ value: Number(m[1]), weight: Number(m[2]) }));
}

function parseDeclaredScore(): number {
  const m = source.match(/<ProductMock\s+score=\{(\d+)\}/);
  if (!m) throw new Error("No se encontró el `score` del ProductMock en la página");
  return Number(m[1]);
}

describe("la maqueta de GEO Score de /que-es-genscore no se contradice", () => {
  const rows = parseMockRows();

  it("declara las cinco componentes reales del GEO Score", () => {
    expect(rows.length).toBe(5);
  });

  it("los pesos suman 100", () => {
    expect(rows.reduce((s, r) => s + r.weight, 0)).toBe(100);
  });

  it("el número del gauge es la media ponderada exacta de las barras que se ven", () => {
    const computed = Math.round(rows.reduce((s, r) => s + (r.value * r.weight) / 100, 0));
    expect(
      parseDeclaredScore(),
      `El gauge declara ${parseDeclaredScore()} pero sus cinco barras dan ${computed}. ` +
        "Un lector que sume las barras a ojo detecta la incoherencia, y con ella pierde la " +
        "confianza en el resto de la página."
    ).toBe(computed);
  });
});
