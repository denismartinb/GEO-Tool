import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { consoleTitle, projectScreenTitle } from "./console-metadata";

/**
 * ROOT-METADATA-1 — toda pantalla privada tiene su propia pestaña.
 *
 * **El fallo que vigila no tiene síntoma**, como casi todo en esta zona: una
 * pantalla nueva sin `metadata` no falla, no avisa y no se ve rara — hereda
 * `title: "GenScore"` del layout raíz y se confunde con las otras quince. Fue
 * exactamente así como llegaron a ser dieciséis pantallas con la misma
 * pestaña: nadie tomó esa decisión, simplemente nadie escribió la línea.
 *
 * **Las redirecciones quedan fuera a propósito.** Diez rutas privadas sólo
 * llaman a `redirect()` y no pintan nada; darles título sería código muerto,
 * porque el navegador nunca llega a mostrar esa pestaña. Distinguirlas aquí es
 * lo que evita que el guardián obligue a escribir algo inútil — y que, por
 * inútil, alguien acabe desactivándolo.
 */

const ROOT = process.cwd();

/** Rutas privadas: detrás de `requireUser`/`requireOperator` y en el `disallow` de `robots.ts`. */
const PRIVATE_ROOTS = ["app/dashboard", "app/admin", "app/mfa", "app/debug"];

function findPages(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "page.tsx") out.push(full);
    }
  };
  walk(join(ROOT, dir));
  return out;
}

/**
 * Una página que sólo redirige: llama a `redirect()` y no devuelve árbol.
 * Deliberadamente tosco —igual que el clasificador de `console-css-scope`—
 * porque el error caro es al revés: dar por redirección algo que sí pinta.
 * Por eso exige las DOS condiciones.
 */
function isRedirectOnly(source: string): boolean {
  return /\n\s*redirect\(/.test(source) && !/return \(|<div|<main|<section/.test(source);
}

/** El título propio puede venir de la página, de un layout por encima, o ser dinámico. */
function declaresOwnTitle(file: string): boolean {
  const source = readFileSync(file, "utf8");
  if (/export const metadata|export async function generateMetadata/.test(source)) return true;
  // Un layout ancestro puede declararlo para toda su rama (`app/admin/layout.tsx`).
  let dir = join(file, "..");
  const stop = join(ROOT, "app");
  while (dir.startsWith(stop)) {
    const layout = join(dir, "layout.tsx");
    try {
      if (/export const metadata|export async function generateMetadata/.test(readFileSync(layout, "utf8"))) {
        // El layout RAÍZ no cuenta: su título es justamente el que queremos dejar de heredar.
        if (dir !== stop) return true;
      }
    } catch {
      // No hay layout en este nivel; se sigue subiendo.
    }
    if (dir === stop) break;
    dir = join(dir, "..");
  }
  return false;
}

describe("toda pantalla privada declara su propia pestaña", () => {
  const pages = PRIVATE_ROOTS.flatMap(findPages);

  it("encuentra las pantallas privadas (el barrido no se ha quedado vacío)", () => {
    // Sin esto, un cambio de rutas dejaría el test verde sin comprobar nada —
    // el mismo fallo que hizo pasar en verde un test de exclusividad con el
    // filtro vacío (log §86).
    expect(pages.length).toBeGreaterThan(15);
  });

  it("ninguna hereda el `title: \"GenScore\"` del layout raíz", () => {
    const bare = pages
      .filter((f) => !isRedirectOnly(readFileSync(f, "utf8")))
      .filter((f) => !declaresOwnTitle(f))
      .map((f) => f.slice(ROOT.length + 1));

    expect(
      bare,
      "Estas pantallas privadas no declaran título propio, así que su pestaña dice " +
        '"GenScore" igual que todas las demás y no se distinguen entre sí:\n' +
        bare.join("\n") +
        "\nAñade `export const metadata = consoleMetadata(\"…\")`, o " +
        "`generateMetadata` con `projectScreenMetadata` si la pantalla pertenece a un dominio."
    ).toEqual([]);
  });
});

describe("el formato del título", () => {
  it("usa el mismo separador que los 33 títulos públicos", () => {
    expect(consoleTitle("Ajustes")).toBe("Ajustes — GenScore");
  });

  it("pone el dominio antes de la marca, que es lo que sobrevive al recorte", () => {
    expect(projectScreenTitle("Visión general", "acme.com")).toBe("Visión general · acme.com — GenScore");
  });

  it("sin dominio resuelto, cae al nombre de la pantalla en vez de a un hueco", () => {
    expect(projectScreenTitle("Prompts", null)).toBe("Prompts — GenScore");
  });
});
