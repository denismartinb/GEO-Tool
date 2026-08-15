import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SEO-POS-1 Fase C, S6 — invariantes del artículo de métricas y de su pilar.
 *
 * **Este fichero cambió de sentido dos veces el mismo día, las dos por una
 * revisión del fundador. Merece la pena que quede escrito, porque la primera
 * versión era razonable y aun así partía de una premisa equivocada.**
 *
 * v1 (log §73): el artículo publicaba constantes del producto —el suelo de
 * respuestas, el tamaño de la ventana, qué motores llevan búsqueda— y el test
 * las importaba del código para que el texto y el producto no se separaran.
 * Buen mecanismo, premisa equivocada.
 *
 * v2 (log §75 y §76): esas constantes **no se publican**. Los pesos, los
 * umbrales y la mecánica del compuesto son configuración del producto;
 * contarlos, además de regalarlos, abarata la métrica — "una media ponderada
 * de cinco señales" hace que un trabajo de meses parezca una tarde de hoja de
 * cálculo. Lo que se publica es el criterio, no la máquina.
 *
 * Así que el test ya no ata el texto a las constantes: **comprueba que no
 * estén**. La red general vive en `article-honesty.test.ts`; aquí quedan las
 * afirmaciones propias de estas tres páginas.
 */

function readArticle(slug: string): string {
  return readFileSync(join(process.cwd(), "app", "blog", slug, "page.mdx"), "utf8");
}

const METRICAS = readArticle("metricas-geo-que-medir");
const PILAR = readArticle("que-es-el-geo-score");

/** Valores de los `<Stat value="…">` de un artículo, en orden. */
function statValues(source: string): string[] {
  return [...source.matchAll(/<Stat\s+value="([^"]+)"/g)].map((m) => m[1]);
}

describe("el artículo de métricas enseña criterio, no configuración", () => {
  it("no atribuye a GenScore un umbral concreto de respuestas", () => {
    expect(
      METRICAS,
      "el umbral con el que decidimos publicar una franja es configuración del producto: " +
        "el artículo explica la aritmética de la muestra, que es cierta para cualquiera"
    ).not.toMatch(/en GenScore ese umbral/i);
  });

  it("no describe por dentro el motor de cada proveedor", () => {
    expect(
      METRICAS,
      "qué motor ejecutamos con búsqueda web y cuál no es configuración nuestra. El " +
        "artículo dice lo que el lector necesita: un motor que no busca no puede citar."
    ).not.toMatch(/En GenScore, Gemini y ChatGPT/i);
  });

  it("mantiene la afirmación que lo diferencia: la posición se mide solo donde apareces", () => {
    expect(METRICAS).toMatch(/solo sobre las respuestas donde apareces/i);
  });

  it("sus cifras destacadas se apoyan en algo que el lector puede comprobar", () => {
    const fuentes = [...METRICAS.matchAll(/<Stat[^>]*source="([^"]+)"/g)].map((m) => m[1]);
    expect(fuentes.length).toBeGreaterThan(0);
    for (const fuente of fuentes) {
      expect(
        fuente,
        `"${fuente}" no vale como fuente de una cifra destacada: tiene que remitir a algo ` +
          "verificable (aritmética, datos de ejemplo declarados), no a nuestra metodología interna"
      ).not.toMatch(/Metodolog[íi]a de GenScore/i);
    }
  });
});

/**
 * El pilar publicaba los pesos (log §74, retirados en §75) y después seguía
 * definiendo el GEO Score como "una media ponderada de cinco señales" (§76).
 * Se comprueban las dos cosas aquí porque es el artículo al que apuntan todos
 * los demás cuando hablan de la métrica: si se relaja, se relaja el sitio
 * entero.
 */
describe("el pilar del GEO Score no publica ni el reparto ni la mecánica", () => {
  it("ninguna cifra de su rejilla es un porcentaje de la fórmula", () => {
    const porcentajes = statValues(PILAR).filter((v) => v.includes("%"));
    expect(
      porcentajes,
      `el pilar publica ${porcentajes.join(", ")} en su StatGrid. Un porcentaje ahí es el ` +
        "reparto de pesos, que es configuración interna del producto."
    ).toEqual([]);
  });

  it("no define la métrica por su aritmética", () => {
    expect(PILAR).not.toMatch(/media ponderada/i);
    expect(PILAR, "el recuento de señales es parte de la fórmula, no del valor para el lector").not.toMatch(
      /(cinco|cuatro)\s+(señales|componentes)/i
    );
  });

  it("los pesos siguen en el fuente para que el gauge sea verificable, pero no se renderizan", () => {
    expect(PILAR, "mockRows necesita sus pesos: es lo que hace comprobable el número del gauge").toMatch(
      /weight:\s*\d+/
    );
    const mock = readFileSync(join(process.cwd(), "components", "blog", "article", "figure.tsx"), "utf8");
    expect(
      mock,
      "ProductMock volvería a pintar «peso N%» y el reparto sería público otra vez"
    ).not.toMatch(/peso \{?row\.weight/);
  });
});

/**
 * La landing comercial es la superficie más vista del sitio y publicaba, hasta
 * esta revisión, el desglose aritmético entero ("80×40% + 64×25% + … = 65
 * puntos") con los pesos de una versión ya retirada. No es un artículo, así
 * que ningún guardián de contenido la miraba.
 */
describe("la landing de GEO no publica la aritmética del score", () => {
  const GEO = readFileSync(join(process.cwd(), "app", "geo", "page.tsx"), "utf8");

  it("no pinta el peso de cada componente", () => {
    expect(GEO).not.toMatch(/peso \{c\.weight\}/);
  });

  it("no publica la suma ponderada como pie de la maqueta", () => {
    expect(GEO, "el desglose `valor×peso = puntos` es la fórmula entera").not.toMatch(/c\.value\}×\$\{c\.weight/);
  });

  it("conserva los pesos en el fuente: el medidor tiene que cuadrar con sus barras", () => {
    expect(GEO).toMatch(/weight: \d+/);
    expect(GEO).toMatch(/sum \+ \(c\.value \* c\.weight\) \/ 100/);
  });
});
