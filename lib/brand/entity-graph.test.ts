import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APPLICATION_CATEGORY,
  CANONICAL_DEFINITION_LONG,
  ORGANIZATION_ID,
  SITE_ORIGIN,
  SOFTWARE_APPLICATION_ID
} from "./canonical-definition";
import {
  GEO_SCORE_ALTERNATE_PATHS,
  GEO_SCORE_CANONICAL_PATH,
  GEO_SCORE_CANONICAL_URL,
  GEO_SCORE_DEFINITION,
  GEO_SCORE_TERM_ID
} from "./geo-score-definition";

/**
 * SEO-POS-1 Fase E, E3 + E4 (log §100) — el grafo de entidades del sitio.
 *
 * **Qué protege, y por qué hace falta un test para esto.** El JSON-LD es el
 * caso extremo de la clase de fallo que esta zona lleva todo el plan
 * encontrando: **no tiene síntoma**. Un `@id` mal escrito, un `publisher` que
 * apunta a un nodo que no existe, una segunda copia de `Organization` con
 * otros datos — nada de eso rompe la página, ni sale en el piloto, ni lo ve
 * un lector. Simplemente el motor lee dos entidades donde hay una, que es
 * exactamente el problema que la Fase E existe para arreglar. Un guardián que
 * mira la página renderizada es lo único que lo nota.
 */

const ROOT = process.cwd();
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

describe("E3 — la home y la página de entidad declaran EL MISMO producto", () => {
  const shared = read("components", "seo", "software-application-schema.tsx");
  const home = read("app", "page.tsx");
  const entity = read("app", "que-es-genscore", "page.tsx");

  it("las dos montan el componente compartido, no una copia a mano", () => {
    for (const [label, source] of [
      ["la home", home],
      ["/que-es-genscore", entity]
    ] as const) {
      expect(source, `${label} debería montar <SoftwareApplicationSchema />`).toContain(
        "<SoftwareApplicationSchema />"
      );
      expect(
        source.includes('"@type": "SoftwareApplication"'),
        `${label} vuelve a declarar el schema a mano. Dos declaraciones del mismo producto ` +
          "divergen al primer cambio de posicionamiento, y el síntoma sería el sitio " +
          "describiéndose de dos formas distintas justo donde un motor lo lee."
      ).toBe(false);
    }
  });

  it("el producto se describe con la definición canónica, no con una redacción propia", () => {
    expect(shared).toContain("CANONICAL_DEFINITION_LONG");
    // Y la constante sigue siendo una frase sobre GEO, no un eslogan: si alguien
    // la vacía, este schema se queda sin descripción sin que nada más avise.
    expect(CANONICAL_DEFINITION_LONG.length).toBeGreaterThan(120);
    expect(APPLICATION_CATEGORY).toBe("BusinessApplication");
  });

  it("`publisher` referencia al Organization del layout, no incrusta una copia", () => {
    expect(shared).toContain('publisher: { "@id": ORGANIZATION_ID }');
    expect(
      shared.includes('publisher: { "@type": "Organization"'),
      "Un `Organization` incrustado dentro del `publisher` es un SEGUNDO nodo llamado " +
        "GenScore, sin relación declarada con el del layout raíz. Para un parser son dos " +
        "entidades que casualmente comparten nombre — la ambigüedad que esta fase quita."
    ).toBe(false);
  });

  it("el Organization del layout expone el `@id` al que se apunta", () => {
    const org = read("components", "seo", "organization-schema.tsx");
    expect(org).toContain('"@id": ORGANIZATION_ID');
  });

  it("los identificadores son URIs estables sobre el dominio propio", () => {
    for (const id of [ORGANIZATION_ID, SOFTWARE_APPLICATION_ID, GEO_SCORE_TERM_ID]) {
      expect(id.startsWith(`${SITE_ORIGIN}/#`), `\`${id}\` debería ser un URI con fragmento`).toBe(true);
    }
    expect(new Set([ORGANIZATION_ID, SOFTWARE_APPLICATION_ID, GEO_SCORE_TERM_ID]).size).toBe(3);
  });
});

describe("E4 — un solo GEO Score explicado en tres URLs, no tres GEO Scores", () => {
  it("la canónica es la metodología, que es a donde ya apuntaba el enlazado interno", () => {
    expect(GEO_SCORE_CANONICAL_PATH).toBe("/docs/metodologia/geo-score");
    expect(GEO_SCORE_CANONICAL_URL).toBe(`${SITE_ORIGIN}${GEO_SCORE_CANONICAL_PATH}`);
    expect(GEO_SCORE_ALTERNATE_PATHS).not.toContain(GEO_SCORE_CANONICAL_PATH);
  });

  it("las tres superficies declaradas existen de verdad", () => {
    const files = [
      ["app", "docs", "metodologia", "geo-score", "page.tsx"],
      ["app", "glosario", "[termino]", "page.tsx"],
      ["app", "blog", "que-es-el-geo-score", "page.mdx"]
    ];
    for (const parts of files) {
      expect(() => read(...parts), `Falta ${parts.join("/")}`).not.toThrow();
    }
  });

  it("la metodología y el glosario emiten el mismo `@id`", () => {
    const docs = read("app", "docs", "metodologia", "geo-score", "page.tsx");
    const glosario = read("app", "glosario", "[termino]", "page.tsx");
    const terms = read("lib", "glosario", "terms.ts");

    expect(docs).toContain("GEO_SCORE_TERM_ID");
    expect(docs).toContain("GEO_SCORE_CANONICAL_URL");
    // El glosario lo emite a través de `canonicalNode`, que sólo rellena este término.
    expect(glosario).toContain("entry.canonicalNode?.termId");
    expect(terms).toContain("termId: GEO_SCORE_TERM_ID");
  });

  it("la definición corta se importa en las tres, no se reescribe en ninguna", () => {
    expect(read("lib", "glosario", "terms.ts")).toContain("definition: GEO_SCORE_DEFINITION");
    expect(read("lib", "docs", "nav.ts")).toContain("description: GEO_SCORE_DEFINITION");
    expect(read("app", "docs", "metodologia", "geo-score", "page.tsx")).toContain(
      "description={GEO_SCORE_DEFINITION}"
    );
  });

  it("la definición publicada no reintroduce el reparto de pesos", () => {
    // `.claude/rules/growth-content.md`: los pesos son configuración del
    // producto y están retirados de todas las superficies desde el 2026-08-13
    // (log §75). Esta cadena se publica ahora en tres sitios a la vez, así que
    // un descuido aquí se multiplica por tres.
    expect(GEO_SCORE_DEFINITION).not.toMatch(/\d+\s*%|\bpeso|\bpondera/i);
  });

  /**
   * El fallo que esta fase deja abierto si nadie lo vigila: una CUARTA página
   * sobre el GEO Score, publicada sin declararse parte del mismo nodo. Vuelve
   * el problema entero, y el barrido es lo único que lo nota — no hay 404 ni
   * error que lo delate.
   *
   * Busca páginas cuya RUTA contenga `geo-score`, que es como se manifestaría
   * una nueva URL dedicada al término. Una mención dentro de otro artículo no
   * es una superficie competidora y no cuenta.
   */
  it("nadie ha publicado una cuarta URL dedicada al término sin declararla", () => {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (/^page\.(tsx|mdx)$/.test(name)) {
          const route = "/" + full.slice(join(ROOT, "app").length + 1).replace(/\/page\.(tsx|mdx)$/, "");
          if (route.includes("geo-score")) found.push(route);
        }
      }
    };
    walk(join(ROOT, "app"));

    const declared = new Set<string>([GEO_SCORE_CANONICAL_PATH, ...GEO_SCORE_ALTERNATE_PATHS]);
    const undeclared = found.filter((route) => !declared.has(route));

    expect(
      undeclared,
      "Hay páginas sobre el GEO Score que no están en `GEO_SCORE_ALTERNATE_PATHS`, así que " +
        "compiten por el término sin declararse el mismo concepto:\n" +
        undeclared.join("\n") +
        "\nAñádelas a esa lista (y emite el `@id` compartido) o no las publiques."
    ).toEqual([]);
  });
});
