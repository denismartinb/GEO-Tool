import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PLANS } from "@/app/pricing/plans-data";

/**
 * TRUST-PROMISES-1 (docs/external-audit-2026-08.md, Fase 2; auditoría
 * externa, P0-06).
 *
 * El fundador en prueba Pro gratuita veía 179 €/mes en Ajustes mientras
 * `/precios` y el modal de cambio de plan, a dos clics, decían 59 €
 * (PROMO-CONSOLE-PARITY-1, log §170) — la consola sola. La auditoría del
 * mismo día encontró la MISMA clase de fallo repetida cinco veces más fuera
 * de la consola: la tira de promoción del hero, la metadescripción de
 * `/precios` y tres piezas de comparativas citaban "179" o "45" como texto
 * escrito a mano, cada una con un comentario propio prometiendo que el
 * número venía de `plans-data.ts` — una promesa que en ningún caso cumplía
 * el código.
 *
 * Estos son contratos a nivel de fuente, deliberadamente crudos, mismo
 * patrón que `tests/mission-parity.test.ts`: comprueban que los ficheros que
 * esta fase corrigió sigan importando `PLANS` y no hayan vuelto a incrustar
 * el precio actual del plan Pro o Starter como texto suelto. No es un
 * barrido genérico sobre todo el repo — un literal "179" en un fichero que
 * nunca prometió sincronía (una nota histórica, un ADR, este mismo test) no
 * es el fallo que se persigue aquí.
 */

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

/**
 * Los comentarios de este mismo cambio citan el precio antiguo a propósito
 * — la nota histórica de por qué el literal estaba mal, o una cita literal
 * de lo que pidió el fundador ("Pro a 179€ (tachado) 59€/mes"). Ninguna de
 * las dos es el fallo que este test persigue: el fallo es un literal que SE
 * RENDERIZA. Se descartan los comentarios de bloque y de línea antes de
 * buscar, para que citarlos al explicar el arreglo no reintroduzca el fallo
 * que el arreglo corrigió.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const PRO_PRICE = PLANS.find((p) => p.id === "pro")!.price;
const STARTER_PRICE = PLANS.find((p) => p.id === "starter")!.price;

/** Cada fichero que citaba un precio a mano, y el import que ahora lo evita. */
const PRICE_QUOTING_FILES = [
  "app/pricing/page.tsx",
  "components/landing/session-ctas.tsx",
  "lib/comparativas/genscore-vs-otterly.ts",
  "lib/comparativas/alternativas-a-otterly.ts",
  "lib/comparativas/mejores-herramientas-geo.ts",
  "app/comparativas/alternativas-a-otterly/page.tsx"
];

describe("precios citados fuera de la consola — TRUST-PROMISES-1", () => {
  it("cada fichero que cita un precio de plan lo importa de plans-data.ts", () => {
    for (const file of PRICE_QUOTING_FILES) {
      const src = read(file);
      expect(src, `${file} debería importar PLANS de app/pricing/plans-data`).toMatch(
        /import\s*\{[^}]*PLANS[^}]*\}\s*from\s*["'](?:@\/app\/pricing\/plans-data|\.{1,2}\/plans-data)["']/
      );
    }
  });

  it("ninguno de esos ficheros vuelve a escribir el precio de Pro como literal", () => {
    // Une el precio a "€" para no rechazar coincidencias inocentes de la
    // cifra sola (un año, un recuento de escaneos) — el fallo real siempre
    // aparecía pegado al símbolo de la moneda.
    const literal = new RegExp(`${PRO_PRICE}\\s*€`);
    for (const file of PRICE_QUOTING_FILES) {
      const src = stripComments(read(file));
      expect(src, `${file} no debería citar "${PRO_PRICE} €" como texto suelto`).not.toMatch(literal);
    }
  });

  it("ninguno de esos ficheros vuelve a escribir el precio de Starter como literal", () => {
    const literal = new RegExp(`${STARTER_PRICE}\\s*€`);
    for (const file of PRICE_QUOTING_FILES) {
      const src = stripComments(read(file));
      expect(src, `${file} no debería citar "${STARTER_PRICE} €" como texto suelto`).not.toMatch(literal);
    }
  });
});
