import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `app/console.css` sólo puede contener estilos que la consola pinta.
 *
 * **Por qué existe** (PRELAUNCH-HARDENING-1 Fase V, V5): la hoja se separó de
 * `globals.css` para que quien entra a /blog no descargue la Visión general ni
 * la Auditoría web. Ese ahorro se evapora en silencio en cuanto alguien
 * escriba aquí una clase que también usa una página pública — no falla nada,
 * simplemente esa página pierde su estilo, que es peor: se ve mal y nadie sabe
 * por qué.
 *
 * La regla es a propósito burda y en la dirección segura: si la clase aparece
 * en CUALQUIER fichero fuera de `app/dashboard/**`, su sitio es `globals.css`.
 * Un clasificador más fino ya se equivocó una vez en la dirección peligrosa
 * durante esta misma fase (dio por "sólo consola" el sistema de artículos del
 * blog, cuyas clases se aplican desde `lib/`).
 *
 * Sólo mira la clase que ENCABEZA cada selector: si el ancestro es de consola,
 * el descendiente no puede casar en una página pública aunque se llame `.on`.
 */

const ROOT = process.cwd();
const CONSOLE_CSS = join(ROOT, "app", "console.css");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (full.endsWith(join("app", "dashboard"))) continue;
      walk(full, out);
    } else if (/\.(tsx|ts|md|mdx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Clases que encabezan algún selector de `app/console.css`. */
function leadingClassesOfConsoleSheet(): string[] {
  const css = readFileSync(CONSOLE_CSS, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const found = new Set<string>();
  for (const line of css.split("\n")) {
    if (!line.includes("{") && !line.trim().endsWith(",")) continue;
    for (const part of line.split("{")[0].split(",")) {
      const selector = part.trim();
      if (!selector || selector.startsWith("@")) continue;
      const leftmost = selector.split(/[\s>+~]/)[0];
      for (const m of leftmost.matchAll(/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g)) found.add(m[1]);
    }
  }
  return [...found];
}

/** Clases nombradas por cualquier fichero que NO sea de la consola. */
function classesUsedOutsideTheConsole(): Set<string> {
  const used = new Set<string>();
  const files = [
    ...walk(join(ROOT, "app")),
    ...walk(join(ROOT, "components")),
    ...walk(join(ROOT, "lib"))
  ];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/className\s*=\s*(?:"([^"]*)"|\{([^}]*)\})|class="([^"]*)"/g)) {
      let blob = m[1] ?? m[3] ?? "";
      if (m[2]) {
        blob = [...m[2].matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`/g)]
          .map((s) => s[1] ?? s[2] ?? s[3] ?? "")
          .join(" ");
      }
      for (const token of blob.matchAll(/[a-zA-Z_][a-zA-Z0-9_-]*/g)) used.add(token[0]);
    }
  }
  return used;
}

describe("app/console.css sigue siendo sólo de la consola", () => {
  it("ninguna de sus clases se usa fuera de app/dashboard", () => {
    const outside = classesUsedOutsideTheConsole();
    const leaked = leadingClassesOfConsoleSheet()
      .filter((c) => outside.has(c))
      .sort();

    expect(
      leaked,
      "Estas clases encabezan selectores de app/console.css pero también se " +
        "usan fuera de app/dashboard/**:\n" +
        `  ${leaked.join(", ")}\n\n` +
        "console.css sólo se carga en la consola, así que esas páginas se " +
        "quedan sin estilo y no falla nada — se ve mal y ya está. Mueve esas " +
        "reglas de vuelta a app/globals.css en este mismo PR."
    ).toEqual([]);
  });

  it("la consola la carga de verdad", () => {
    const layout = readFileSync(join(ROOT, "app", "dashboard", "layout.tsx"), "utf8");
    expect(
      layout,
      "app/dashboard/layout.tsx dejó de importar console.css: la consola se " +
        "quedaría sin la mitad de sus estilos."
    ).toContain("console.css");
  });
});
