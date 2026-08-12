import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOG_POSTS, BLOG_CLUSTERS } from "@/lib/blog/posts";
import { COMPARATIVAS } from "@/lib/seo/llms-txt";

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

/**
 * COMPARATIVAS-DESIGN-1 (2026-08-11): el mismo fallo, un nivel más arriba.
 *
 * El bloque anterior comprueba que el **fixture** siga al producto, pero no que
 * lo haga el **journey**. `/comparativas/genscore-vs-profound` se publicó en
 * SEO-POS-1 S2 (log §58) sin añadir ni su journey ni su entrada de fixture, así
 * que el piloto pasó en verde sobre su propio PR y otra vez sobre el rediseño
 * de esta fase **sin haber visitado nunca esa página** — justo la que el
 * fundador había señalado. Un piloto que no ve una pantalla no la aprueba, y
 * aquí ni siquiera se sabía que no la veía.
 *
 * Las comparativas se prestan a esto más que el blog: cada una es un `page.tsx`
 * a mano y un `test(...)` a mano, sin bucle sobre una lista, así que publicar
 * una y olvidar la otra mitad no rompe nada visible.
 *
 * Comprobación de texto sobre el spec, no un import: el spec de Playwright no
 * importa código de la app a propósito (ver su cabecera), y lo que interesa
 * aquí es justo que su lista literal cubra la SSOT.
 */
const specSource = readFileSync(
  join(process.cwd(), "tests", "pilot", "journeys", "public-pages.spec.ts"),
  "utf8"
);

describe("toda comparativa publicada la pilota alguien", () => {
  it("cada ruta de COMPARATIVAS tiene su journey en public-pages.spec.ts", () => {
    const missing = COMPARATIVAS.map((c) => c.path).filter((path) => !specSource.includes(`"${path}"`));

    expect(
      missing,
      "Estas comparativas están publicadas pero ningún journey las visita, así " +
        "que el piloto puede dar PASS sin haberlas visto nunca:\n" +
        `${missing.join("\n") || "(ninguna)"}\n\n` +
        "Añade su test a tests/pilot/journeys/public-pages.spec.ts en este mismo PR."
    ).toEqual([]);
  });

  it("cada ruta de COMPARATIVAS la sirve el fixture del self-check", () => {
    const missing = COMPARATIVAS.map((c) => c.path).filter((path) => !serverSource.includes(`"${path}"`));

    expect(
      missing,
      "PUBLIC_PAGES en tests/pilot/fixtures/server.mjs no sirve estas rutas, así " +
        "que su journey recibe un 404 y tumba el caso SANO del self-check:\n" +
        `${missing.join("\n") || "(ninguna)"}`
    ).toEqual([]);
  });
});
