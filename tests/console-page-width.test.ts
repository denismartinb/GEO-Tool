import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WEB-AUDIT-WIDTH-1 (2026-08-27, log §178) — las columnas de la consola suben
 * los mismos cuatro peldaños, y eso se comprueba aquí.
 *
 * **Por qué existe.** Auditoría web se quedó meses en el primer peldaño (460px,
 * ancho de móvil) mientras sus seis hermanas subían los otros tres. No falló
 * nada: la página cargaba, el piloto la fotografiaba, los tests pasaban. Se veía
 * mal y nadie sabía por qué — el fundador acabó describiéndolo a ojo, «está
 * centrado el contenido como si fuera mobile». Y lo más caro del fallo es que
 * el comentario del propio `web-audit/page.tsx` YA decía cuál era el estándar
 * («the founder-approved 640/1200/1280px console width standard»): la escalera
 * estaba escrita en la intención y no en el CSS, que es exactamente la clase de
 * hueco que un humano no ve leyendo un diff.
 *
 * La escalera es de CITATIONS-REDESIGN-1 (log §5) y la ratificó
 * OV-DESKTOP-2 (log §119). Si algún día se cambia, se cambia para las siete y
 * este test se actualiza con ellas — que es justo lo que se quiere que cueste.
 *
 * Deliberadamente NO comprueba `--ov-hdr-page-cap` ni `--mrk-page-cap`: ésos
 * sólo hacen falta donde la clase estrecha va COMBINADA sobre `.page` y por lo
 * tanto baja su tope real (hoy sólo `.cm2-page`). Exigirlos a las siete
 * reintroduciría el fallo que ya documenta `app/console.css`: alimentar la
 * fórmula de bleed con un tope al que `.page` nunca estuvo sujeto.
 */

const ROOT = process.cwd();

/** Los cuatro peldaños, en `px`. `null` = fuera de toda media query. */
const LADDER: ReadonlyArray<readonly [number | null, number]> = [
  [null, 460],
  [900, 640],
  [1200, 1200],
  [1600, 1280]
];

/**
 * Una fila por columna estrecha de la consola. Añadir una pantalla nueva con
 * su propia clase de columna significa añadirla aquí — si no, nadie se entera
 * de que le falta un peldaño hasta que alguien lo mire a ojo.
 */
const COLUMNS = [
  ".ov2-scope",
  ".pr2-page",
  ".cm2-page",
  ".cit2-page",
  ".rec2-scope",
  ".dm2-page",
  ".wa2-page"
] as const;

const SHEETS = ["app/globals.css", "app/console.css"] as const;

/**
 * Recorre la hoja con una pila de llaves, para que una declaración partida en
 * varias líneas cuente igual que una de una sola. Un lector por líneas se dejaba
 * `.dm2-page` y `.rec2-scope` fuera sin decirlo — el mismo silencio que este
 * fichero existe para romper.
 */
function readLadders(css: string): Map<string, Map<number | null, number>> {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = new Map<string, Map<number | null, number>>();
  const mediaStack: Array<number | null> = [];

  let i = 0;
  let head = "";
  while (i < src.length) {
    const char = src[i];
    if (char === "{") {
      const selector = head.trim();
      const media = /^@media\s*\(\s*min-width:\s*(\d+)px\s*\)\s*$/.exec(selector);
      if (media) {
        mediaStack.push(Number(media[1]));
        head = "";
        i += 1;
        continue;
      }
      // Bloque de declaraciones: consumir hasta su `}` de cierre.
      let depth = 1;
      let j = i + 1;
      while (j < src.length && depth > 0) {
        if (src[j] === "{") depth += 1;
        else if (src[j] === "}") depth -= 1;
        j += 1;
      }
      const body = src.slice(i + 1, j - 1);
      const declared = /(?:^|;)\s*max-width:\s*(\d+)px/.exec(body);
      if (declared) {
        const breakpoint = mediaStack.length ? mediaStack[mediaStack.length - 1] : null;
        for (const part of selector.split(",")) {
          const name = part.trim();
          if (!(COLUMNS as readonly string[]).includes(name)) continue;
          const ladder = out.get(name) ?? new Map<number | null, number>();
          ladder.set(breakpoint, Number(declared[1]));
          out.set(name, ladder);
        }
      }
      head = "";
      i = j;
      continue;
    }
    if (char === "}") {
      mediaStack.pop();
      head = "";
      i += 1;
      continue;
    }
    head += char;
    i += 1;
  }
  return out;
}

describe("las columnas de la consola suben los mismos peldaños", () => {
  const ladders = new Map<string, Map<number | null, number>>();
  for (const sheet of SHEETS) {
    const parsed = readLadders(readFileSync(join(ROOT, sheet), "utf8"));
    for (const [selector, steps] of parsed) {
      const merged = ladders.get(selector) ?? new Map<number | null, number>();
      for (const [breakpoint, width] of steps) merged.set(breakpoint, width);
      ladders.set(selector, merged);
    }
  }

  it.each(COLUMNS)("%s declara los cuatro anchos", (selector) => {
    const steps = ladders.get(selector);
    expect(steps, `${selector} no declara ningún max-width en app/globals.css ni app/console.css`).toBeDefined();

    for (const [breakpoint, expected] of LADDER) {
      const where = breakpoint === null ? "fuera de media query" : `@media (min-width: ${breakpoint}px)`;
      expect(
        steps!.get(breakpoint),
        `${selector} debería medir ${expected}px ${where}. ` +
          `Le falta un peldaño de la escalera 460/640/1200/1280 (log §5, §119, §178): ` +
          `una pantalla a la que le falte se queda en ancho de móvil en escritorio sin que falle nada.`
      ).toBe(expected);
    }
  });
});
