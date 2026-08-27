import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MARKETING_SHELLS } from "../marketing-content-links";
import { PAYMENT_BADGES } from "./payment-badges";

/**
 * FOOTER-PAYMENT-TRUST-1 (2026-08-27, log §182).
 *
 * El fundador pidió llevar la fila «Pagos seguros con» de `/precios` también
 * al pie de página, para que la confianza no dependa de haber llegado hasta
 * ahí. Antes de tocar código existía como un array y un bloque de JSX
 * declarados a mano dentro de `pricing-page.tsx` — en cuanto un segundo sitio
 * (el pie, en seis shells) necesita la misma fila, esa copia es la clase de
 * fallo que este repositorio ya paga por duplicado: dos cosas con el mismo
 * significado que pueden divergir en silencio en cuanto alguien edite una sin
 * acordarse de la otra (§36, §177 — "dos números con el mismo significado y
 * distinto valor es un fallo").
 *
 * `PaymentBadgesRow` vive en `components/marketing/payment-badges.tsx` y este
 * test comprueba dos cosas: que los seis shells públicos con pie completo la
 * usan, y que `/precios` —la pantalla que la originó— también importa la
 * versión compartida en vez de conservar su propia copia.
 */

const ROOT = process.cwd();

function footerBlockOf(shell: string): string {
  const source = readFileSync(join(ROOT, shell), "utf8");
  const start = source.indexOf("<footer");
  const end = source.indexOf("</footer>", start);
  if (start === -1 || end === -1) {
    throw new Error(`${shell} no tiene un bloque <footer> reconocible`);
  }
  return source.slice(start, end);
}

describe("PAYMENT_BADGES", () => {
  it("no lleva insignias sin nombre, color o trazado", () => {
    for (const badge of PAYMENT_BADGES) {
      expect(badge.name.trim().length).toBeGreaterThan(0);
      expect(badge.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(badge.path.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("pie de página: fila de pagos seguros", () => {
  for (const shell of MARKETING_SHELLS) {
    it(`${shell} renderiza PaymentBadgesRow en su pie`, () => {
      expect(
        footerBlockOf(shell).includes("<PaymentBadgesRow"),
        `${shell} no muestra la fila de pagos seguros en el pie`
      ).toBe(true);
    });
  }

  it("`/precios` importa la fila compartida, no una copia local", () => {
    const source = readFileSync(join(ROOT, "components/pricing/pricing-page.tsx"), "utf8");
    expect(
      source.includes('from "@/components/marketing/payment-badges"'),
      "pricing-page.tsx no importa components/marketing/payment-badges — " +
        "si declara su propio array de insignias, puede divergir del pie sin que nada avise"
    ).toBe(true);
    expect(
      /const PAYMENT_BADGES\s*[:=]/.test(source),
      "pricing-page.tsx vuelve a declarar PAYMENT_BADGES a mano en vez de importarlo"
    ).toBe(false);
  });
});
