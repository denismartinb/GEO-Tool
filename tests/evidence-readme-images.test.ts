import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Las capturas de evidencia se entregan en `docs/evidence/<carpeta>/README.md`. Dos fallos reales
 * hicieron que «la entrega» no se viera: nombrar el PNG entre backticks (se lee como código, no
 * como imagen) y enlazar a un fichero que no existe (una miniatura rota). Esto los impide:
 *   · todo `![alt](ruta)` apunta a un fichero que existe en la carpeta;
 *   · ningún nombre de `.png` va entre backticks;
 *   · todo `.png` de la carpeta está incrustado al menos una vez;
 *   · toda imagen lleva texto alternativo.
 */
const ROOT = join(process.cwd(), "docs/evidence");
const folders = readdirSync(ROOT).filter((name) => statSync(join(ROOT, name)).isDirectory());

describe("README de evidencia", () => {
  it("hay al menos una carpeta de evidencia", () => {
    expect(folders.length).toBeGreaterThan(0);
  });

  for (const folder of folders) {
    describe(folder, () => {
      const dir = join(ROOT, folder);
      const readmePath = join(dir, "README.md");
      const pngs = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".png"));

      it("tiene README", () => {
        expect(existsSync(readmePath)).toBe(true);
      });

      const md = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "";
      const images = [...md.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)].map((m) => ({ alt: m[1], target: m[2].replace(/^\.\//, "") }));

      it("toda imagen incrustada apunta a un fichero que existe y tiene texto alternativo", () => {
        for (const image of images) {
          expect(image.alt.trim().length, `sin alt: ${image.target}`).toBeGreaterThan(0);
          expect(existsSync(join(dir, image.target)), `no existe: ${image.target}`).toBe(true);
        }
      });

      it("ningún .png aparece entre backticks (se leería como código, no como imagen)", () => {
        expect(md).not.toMatch(/`[^`\n]*\.png`/i);
      });

      it("todo .png de la carpeta está incrustado", () => {
        const embedded = new Set(images.map((i) => i.target));
        const missing = pngs.filter((f) => !embedded.has(f));
        expect(missing, `sin incrustar: ${missing.join(", ")}`).toEqual([]);
      });
    });
  }
});
