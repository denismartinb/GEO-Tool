import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMPARATIVAS_INDEX } from "./index";

/**
 * BLOG-COVERS-2026-08: `COMPARATIVAS_INDEX` sustituye al array local que
 * antes vivía solo en `app/comparativas/page.tsx`, ahora compartido también
 * por el carril de Comparativas de `/blog`. Mismo motivo que
 * `marketing-content-links.test.ts`: un href o título que apunte a nada no
 * tiene por qué esperar a que alguien lo pinche para descubrirlo.
 */

const ROOT = process.cwd();

describe("COMPARATIVAS_INDEX", () => {
  it("cada href apunta a una página real dentro de app/comparativas", () => {
    for (const c of COMPARATIVAS_INDEX) {
      const dir = join(ROOT, "app", c.href.replace(/^\//, ""));
      expect(existsSync(join(dir, "page.tsx")), `${c.href} no tiene page.tsx en app/`).toBe(true);
    }
  });

  it("no hay hrefs duplicados", () => {
    const hrefs = COMPARATIVAS_INDEX.map((c) => c.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("todo título y blurb tiene contenido real", () => {
    for (const c of COMPARATIVAS_INDEX) {
      expect(c.title.trim().length, `${c.href} no tiene título`).toBeGreaterThan(0);
      expect(c.blurb.trim().length, `${c.href} no tiene blurb`).toBeGreaterThan(0);
    }
  });
});
