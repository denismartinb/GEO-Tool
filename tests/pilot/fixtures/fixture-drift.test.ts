import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOG_POSTS, BLOG_CLUSTERS } from "@/lib/blog/posts";

/**
 * El fixture del self-check no puede quedarse atrás del producto.
 *
 * **Por qué existe** (PRELAUNCH-HARDENING-1, log §44): el 2026-08-09 corrió por
 * primera vez `pnpm pilot:selfcheck` y falló — no porque el arnés hubiera
 * dejado de detectar fallos (los tres fixtures rotos los pilló los tres), sino
 * porque el fixture **sano** había dejado de estarlo. `tests/pilot/journeys/`
 * fue creciendo (posts nuevos, rediseño de Ajustes, el tour) y
 * `fixtures/server.mjs` devolvía 404 en lo que no conocía, así que el caso que
 * debe pasar fallaba.
 *
 * Arreglar la lista una vez no sirve de nada: vuelve a desincronizarse con el
 * siguiente artículo. Esto lo convierte en un fallo de CI en el mismo PR que
 * añade el contenido, que es cuando cuesta treinta segundos arreglarlo.
 *
 * Es a propósito una comprobación de **texto**, no un import: `server.mjs` es
 * JavaScript suelto que arranca un servidor al importarse, y lo que interesa
 * aquí es justo su lista literal.
 */

const serverSource = readFileSync(
  join(process.cwd(), "tests", "pilot", "fixtures", "server.mjs"),
  "utf8"
);

function literalArray(name: string): string[] {
  const match = serverSource.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`));
  if (!match) throw new Error(`No se encontró la constante ${name} en fixtures/server.mjs`);

  // Se quitan los comentarios de línea antes de extraer: la primera versión de
  // este parser leyó como si fuera un elemento la palabra entrecomillada de un
  // comentario dentro del propio array, y reportó un slug "sobrante" que no
  // existía. Un guardián que da un falso positivo se desactiva enseguida.
  const withoutComments = match[1].replace(/\/\/[^\n]*/g, "");
  return [...withoutComments.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("el fixture del piloto sigue al producto", () => {
  it("sirve todos los posts del blog que existen de verdad", () => {
    const fixtureSlugs = literalArray("BLOG_SLUGS").sort();
    const realSlugs = BLOG_POSTS.map((post) => post.slug).sort();

    const missing = realSlugs.filter((slug) => !fixtureSlugs.includes(slug));
    const extra = fixtureSlugs.filter((slug) => !realSlugs.includes(slug));

    expect(
      { missing, extra },
      "BLOG_SLUGS en tests/pilot/fixtures/server.mjs no coincide con BLOG_POSTS.\n" +
        `Faltan en el fixture: ${missing.join(", ") || "(ninguno)"}\n` +
        `Sobran en el fixture: ${extra.join(", ") || "(ninguno)"}\n\n` +
        "Un slug que falta hace que el journey de ese post reciba un 404, y eso " +
        "tumba el caso SANO del self-check — el que debe pasar. Añádelo a la " +
        "lista del fixture en este mismo PR."
    ).toEqual({ missing: [], extra: [] });
  });

  it("sirve todos los clusters del blog que existen de verdad", () => {
    const fixtureKeys = literalArray("BLOG_PILLAR_KEYS").sort();
    const realKeys = BLOG_CLUSTERS.map((cluster) => cluster.key).sort();

    expect(
      fixtureKeys,
      "BLOG_PILLAR_KEYS en el fixture no coincide con BLOG_CLUSTERS. Mismo " +
        "motivo que arriba: la página pilar de un cluster que el fixture no " +
        "conoce devuelve 404."
    ).toEqual(realKeys);
  });
});
