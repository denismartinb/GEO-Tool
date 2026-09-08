import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Un componente de SERVIDOR no importa valores de un módulo `"use client"`.
 *
 * **Por qué existe** (MEAN-RANK-READS-TRUE-1, log §177). La página de
 * Competidores importaba `DEFAULT_VISIBLE` —un simple `= 4`— de
 * `components/ui/position-trend-chart.tsx`, que es `"use client"`. Next
 * convierte los exports de un módulo cliente en **referencias de cliente**
 * cuando los pide el servidor, así que lo que llegaba no era el número 4:
 * `rankedKeys.slice(0, cap)` devolvía vacío y el gráfico salía **con una sola
 * línea** en vez de cinco.
 *
 * Lo que hace peligroso a este fallo es todo lo que NO lo detecta: el typecheck
 * pasa (los tipos son correctos a ambos lados), los tests unitarios pasan (no
 * cruzan la frontera), `next build` compila y el piloto marca la pantalla en
 * verde porque carga sin errores. Sólo se ve mirando la captura y contando
 * líneas. Este test es lo único que lo caza sin ojos.
 *
 * **La regla es sobre VALORES, no sobre tipos ni componentes.** `import type`
 * se borra al compilar y un componente cliente es precisamente lo que un
 * servidor debe importar; lo que no puede cruzar es una constante o una función
 * que el servidor vaya a EJECUTAR. Su sitio es un módulo compartido sin
 * `"use client"` — como `lib/competitors/trend-window.ts`, donde acabó ésta.
 */

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function isClientModule(file: string): boolean {
  const head = readFileSync(file, "utf8").slice(0, 200);
  return /^\s*["']use client["']/.test(head);
}

/** `import { a, b } from "…"` — sólo los que traen nombres, y sin `import type`. */
const VALUE_IMPORT = /import\s+(?!type\s)\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;

function resolveAlias(spec: string): string | null {
  if (!spec.startsWith("@/")) return null;
  for (const ext of [".ts", ".tsx"]) {
    const candidate = join(ROOT, spec.slice(2) + ext);
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* no existe con esa extensión */
    }
  }
  return null;
}

describe("frontera servidor/cliente", () => {
  const files = walk(join(ROOT, "app")).concat(walk(join(ROOT, "components")));
  const serverFiles = files.filter((f) => !isClientModule(f));

  it("hay ficheros de servidor que comprobar (si no, esto pasaría en vacío)", () => {
    expect(serverFiles.length).toBeGreaterThan(20);
  });

  it("ningún componente de servidor importa un VALOR de un módulo `use client`", () => {
    const offences: string[] = [];

    for (const file of serverFiles) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(VALUE_IMPORT)) {
        const target = resolveAlias(match[2]);
        if (!target || !isClientModule(target)) continue;

        // Los nombres marcados `type` en línea sí pueden cruzar: se borran.
        const values = match[1]
          .split(",")
          .map((n) => n.trim())
          .filter((n) => n && !n.startsWith("type "));
        // Un componente es exactamente lo que el servidor debe importar. La
        // heurística es la del ecosistema: PascalCase = componente.
        const nonComponents = values.filter((n) => !/^[A-Z][a-zA-Z0-9]*$/.test(n.split(" as ")[0]));
        if (nonComponents.length === 0) continue;

        offences.push(`${relative(ROOT, file)} → ${match[2]}: ${nonComponents.join(", ")}`);
      }
    }

    expect(
      offences,
      "Un componente de servidor importa valores de un módulo `use client`. Next los convierte " +
        "en referencias de cliente, así que lo que llega NO es el valor — y nada falla al " +
        "compilar (log §177: un `= 4` llegó como algo que no era 4 y el gráfico salió con una " +
        "línea en vez de cinco). Mueve la constante o la función a un módulo compartido sin " +
        `"use client".\n${offences.join("\n")}`
    ).toEqual([]);
  });
});
