import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PRICING-PAY-BADGES-CENTER-1 (2026-08-27, log §180).
 *
 * `.price-pay-icons` es un flex container ANIDADO dentro de `.price-pay-badges`
 * (label + icons como sus dos únicos hijos). En desktop/tablet las 5 insignias
 * caben en una sola línea, así que el `justify-content: center` del padre basta
 * — esa línea es el único ítem de su fila. En móvil no caben, `.price-pay-icons`
 * envuelve POR DENTRO en dos filas propias, y el centrado del padre sólo centra
 * esa caja como bloque: sin su propio `justify-content`, cada fila interior caía
 * a `flex-start` por defecto — las tres primeras insignias pegadas al borde
 * izquierdo, las dos últimas debajo, también a la izquierda. Confirmado
 * reproduciendo la captura real del fundador en un fixture Playwright a 375px
 * antes de tocar el CSS.
 *
 * El fallo era invisible en tablet y desktop (una sola línea no revela un
 * `justify-content` ausente), así que sólo se ve mirando móvil — exactamente la
 * clase de fallo que este repo ya ha aprendido a fijar con un test de fuente en
 * vez de confiar en que alguien vuelva a mirar la captura correcta.
 */

const CSS = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

function ruleBodyFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(CSS);
  expect(match, `no se encontró la regla ${selector} en app/globals.css`).not.toBeNull();
  return match![1];
}

describe("insignias de pago de /precios", () => {
  it("`.price-pay-icons` centra sus propias líneas cuando envuelve", () => {
    const body = ruleBodyFor(".price-pay-icons");
    expect(
      body,
      "sin justify-content: center, las filas que `.price-pay-icons` genera al " +
        "envolver en móvil caen a flex-start (pegadas a la izquierda) — el " +
        "centrado de `.price-pay-badges` sólo centra la caja como bloque, no " +
        "las líneas de dentro (log §180)."
    ).toMatch(/justify-content:\s*center/);
  });

  it("`.price-pay-badges` sigue centrando el grupo (label + icons) como bloque", () => {
    const body = ruleBodyFor(".price-pay-badges");
    expect(body).toMatch(/justify-content:\s*center/);
  });
});
