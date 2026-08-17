import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

/**
 * SEO-POS-1 Fase E, E1 (log §91) — una sola grafía para la marca y para la
 * métrica.
 *
 * **Por qué existe.** Antes de esta fase el repositorio usaba las cuatro
 * grafías a la vez: 179 `Genscore` contra 114 `GenScore`, y 53 `GeoScore`
 * contra 99 `GEO Score`. Ninguna de las dos inconsistencias rompía nada, y por
 * eso llevaban meses ahí. El coste no es estético: el plan SEO intenta que
 * "GenScore" resuelva a nuestra entidad y no a los otros GenScore públicos
 * (bioinformática, salud mental, trust scoring B2B, Genscore Navarra), y dos
 * grafías de la propia marca es ruido que ponemos nosotros.
 *
 * **Por qué es un test y no una nota en la regla de ruta.** La regla ya decía
 * "el nombre público es Genscore" —la grafía que el fundador acabó
 * descartando— y aun así el repo tenía 114 usos de la otra. Una convención de
 * naming que sólo vive en prosa se erosiona con cada fichero nuevo, porque
 * nadie relee la regla antes de escribir una cadena.
 *
 * **Lo que deliberadamente NO comprueba:** URLs y slugs
 * (`/glosario/geo-score`, `/comparativas/genscore-vs-otterly`), el dominio
 * `genscore.es`, y los identificadores de código (`geoScore`, `GEO_SCORE`,
 * `availableGeoScoreComponents`). Cambiar una URL ya indexada por coherencia
 * tipográfica sería tirar señal a la basura, y renombrar identificadores no
 * aporta nada a la entidad. Por eso las expresiones llevan delimitadores de
 * palabra: sin ellos, un `sed` global parte `availableGeoScoreComponents` en
 * `availableGEO ScoreComponents` y rompe la build — pasó al aplicar esta misma
 * fase.
 */

const SCANNED_DIRS = ["app", "lib", "components", "tests"];
const EXTENSIONS = [".ts", ".tsx", ".mdx", ".mjs"];

/**
 * Este mismo fichero cita las grafías retiradas a propósito —en la
 * explicación de arriba y en los nombres de los tests— así que se excluye de
 * su propio barrido. Sin esto el guardián se denuncia a sí mismo y la única
 * forma de dejarlo verde es borrar la explicación de por qué existe.
 */
const SELF = "lib/brand/naming.test.ts";

/**
 * Comprobación de texto sobre los ficheros versionados, vía `git grep`: no
 * recorre `node_modules` ni `.next`, y ve exactamente lo que se va a publicar.
 *
 * Se pasan **directorios**, no globs. `git grep -- 'app/**' + filtro por
 * extensión en JS' es equivalente y evita las sutilezas de los pathspec de
 * git, donde `app/**\/*.ts` no siempre casa lo que uno cree — y un guardián
 * que barre menos de lo que dice es peor que ninguno.
 *
 * Nota: `git grep` sólo ve ficheros **versionados**. Un fichero nuevo sin
 * `git add` es invisible para este barrido; eso es aceptable porque nada llega
 * a un PR sin estar versionado, pero explica por qué este test puede pasar en
 * local sobre un fichero recién creado y fallar en cuanto se añade.
 */
function gitGrep(pattern: string): string[] {
  try {
    const out = execFileSync("git", ["grep", "-n", "-I", "-E", pattern, "--", ...SCANNED_DIRS], {
      cwd: process.cwd(),
      encoding: "utf8"
    });
    return out
      .trim()
      .split("\n")
      .filter(Boolean)
      .filter((line) => EXTENSIONS.some((ext) => line.split(":")[0].endsWith(ext)))
      .filter((line) => !line.startsWith(SELF));
  } catch {
    // `git grep` sale con código 1 cuando no hay coincidencias — que es el caso
    // sano de todos los tests de este fichero.
    return [];
  }
}

describe("una sola grafía de marca y métrica en copy de usuario", () => {
  it("no queda ningún `Genscore` (la marca se escribe GenScore)", () => {
    const hits = gitGrep("\\bGenscore\\b");
    expect(
      hits,
      "La marca se escribe `GenScore`, con S mayúscula (log §91). Estas líneas usan la " +
        "grafía retirada:\n" +
        hits.join("\n")
    ).toEqual([]);
  });

  it("no queda ningún `GeoScore` (la métrica se escribe GEO Score)", () => {
    const hits = gitGrep("\\bGeoScore\\b");
    expect(
      hits,
      "La métrica se escribe `GEO Score`, con GEO en mayúsculas y separado (log §91). " +
        "`GeoScore` se lee como geografía y compite con geolocalización. Estas líneas " +
        "usan la grafía retirada:\n" +
        hits.join("\n")
    ).toEqual([]);
  });

  /**
   * El fallo que este par de tests NO cogería por sí solo: un `sed` sin
   * delimitadores de palabra que parta un identificador. Se comprueba aparte
   * porque el síntoma es una build rota, no una grafía incorrecta, y conviene
   * que el mensaje diga cuál de las dos cosas ha pasado.
   *
   * **Sólo busca `GEO Score`, no `GenScore`.** La primera versión buscaba las
   * dos y marcaba `QueEsGenScorePage` —un identificador PascalCase
   * perfectamente normal— como si fuera daño. `GenScore` pegado a letras es lo
   * corriente en un identificador y no puede romper nada; el fallo real es un
   * **espacio** inyectado en medio de un símbolo, y el espacio sólo puede
   * venir de `GEO Score`. Un guardián con falsos positivos se acaba
   * desactivando, que es la forma más cara de no tener guardián.
   *
   * **Segundo falso positivo, 2026-08-15 (E4):** el plural en prosa. «tres
   * URLs, no tres GEO Scores» es castellano correcto y el barrido lo leía
   * como un símbolo partido, porque la `s` es una letra pegada. El `git grep`
   * queda igual de amplio —POSIX ERE no tiene lookahead— y la excepción se
   * aplica en JS sobre cada línea. Es una exención de una letra concreta en
   * una posición concreta: `GEO Scoresx` sigue saltando.
   *
   * **Por qué no lo cogió el local:** `git grep` sólo ve ficheros versionados
   * (ver `gitGrep`), y la línea culpable estaba en un fichero recién creado y
   * sin `git add`. La suite pasó en verde, se hizo `git add -A`, y el commit
   * salió con el fallo dentro. La lección no es del guardián sino del orden:
   * **`pnpm test` después de `git add`, no antes.**
   */
  it("ningún identificador quedó partido por un renombrado sin delimitadores", () => {
    const PLURAL_IN_PROSE = /GEO Scores(?![A-Za-z_])/g;
    const hits = gitGrep("[A-Za-z_]GEO Score|GEO Score[A-Za-z_]").filter((line) =>
      /[A-Za-z_]GEO Score|GEO Score[A-Za-z_]/.test(line.replace(PLURAL_IN_PROSE, "GEO Score"))
    );
    expect(
      hits,
      "Una grafía nueva quedó pegada a otro token, señal de un reemplazo sin `\\b` " +
        "(p. ej. `availableGeoScoreComponents` → `availableGEO ScoreComponents`):\n" +
        hits.join("\n")
    ).toEqual([]);
  });
});

/**
 * Las rutas públicas ya indexadas no se tocan. Este test las fija: si una
 * sesión futura "arregla" la coherencia renombrando un slug, se lleva por
 * delante el histórico de Search Console de esa URL.
 */
describe("las URLs indexadas no siguen la grafía de marca", () => {
  const sitemap = readFileSync(join(process.cwd(), "app", "sitemap.ts"), "utf8");

  it("los slugs de comparativas y glosario siguen en minúscula", () => {
    expect(sitemap).toContain("/comparativas/genscore-vs-otterly");
    expect(sitemap).not.toMatch(/\/comparativas\/GenScore-vs/);
  });
});
