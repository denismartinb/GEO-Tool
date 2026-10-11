import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOG_POSTS } from "./posts";
import { GLOSSARY_TERMS } from "../glosario/terms";

/**
 * SEO-POS-1 (S1, log §49). El propio borrador del plan proponía titular la
 * primera pieza de la Fase C "…en ChatGPT, Gemini y Perplexity" cuando
 * Perplexity no era un motor que GenScore ejecutara. Se corrigió antes de
 * publicar, pero solo porque alguien releyó el título con cuidado. Este test
 * es la red que no depende de que eso vuelva a pasar.
 *
 * PERPLEXITY-ENGINE-1 (2026-10-11): Perplexity pasa a ser motor de GenScore en
 * Pro y Agencia, así que el guardián deja de vigilar ese nombre y vigila los
 * que siguen fuera. La forma también cambia: ya no basta con que un artículo
 * no nombre un motor, porque varios hablan de Copilot o de AI Overviews como
 * tema de mercado. Lo que no puede pasar es una FRASE que ponga a GenScore y a
 * un motor no soportado juntos sin negarlo ("GenScore no mide AI Overviews").
 */
const UNSUPPORTED_ENGINES = /\b(Copilot|AI Overviews|Grok|DeepSeek|Meta AI)\b/;
const NEGATION = /\b(no|ni|sin|fuera)\b/i;

function readArticle(slug: string): string {
  return readFileSync(join(process.cwd(), "app", "blog", slug, "page.mdx"), "utf8");
}

function sentences(source: string): string[] {
  return source.split(/(?<=[.!?:])\s+|\n\s*\n/);
}

describe("honestidad de motores en el cuerpo de los artículos", () => {
  for (const post of BLOG_POSTS) {
    it(`${post.slug} no presenta como motor de GenScore uno que no ejecuta`, () => {
      const offending = sentences(readArticle(post.slug)).filter(
        (sentence) =>
          // A question ("¿GenScore mide AI Overviews?") asserts nothing.
          !sentence.includes("¿") &&
          /GenScore/.test(sentence) &&
          UNSUPPORTED_ENGINES.test(sentence) &&
          !NEGATION.test(sentence)
      );
      expect(
        offending,
        `${post.slug} pone a GenScore junto a un motor que no ejecuta sin decir que no lo mide.`
      ).toEqual([]);
    });
  }
});

/** Páginas de `/docs`, recorriendo el árbol (hay secciones anidadas). */
function docsPages(): { label: string; text: string }[] {
  const base = join(process.cwd(), "app", "docs");
  const out: { label: string; text: string }[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const here = join(dir, entry.name);
      const file = join(here, "page.tsx");
      if (existsSync(file)) out.push({ label: `docs${prefix}/${entry.name}`, text: readFileSync(file, "utf8") });
      walk(here, `${prefix}/${entry.name}`);
    }
  };
  if (existsSync(base)) {
    const index = join(base, "page.tsx");
    if (existsSync(index)) out.push({ label: "docs", text: readFileSync(index, "utf8") });
    walk(base, "");
  }
  return out;
}

/**
 * SEO-POS-1 S6, revisión del fundador (2026-08-13, log §75):
 *
 * > *"En general no quiero exponer cosas tan concretas del producto, como
 * > pesos reales para un cálculo o estos códigos ADR-0024 · capa de
 * > fiabilidad."*
 *
 * Dos cosas distintas, con el mismo remedio.
 *
 * **Los pesos del compuesto** son configuración interna: quien los tiene puede
 * reproducir la métrica sin haberla construido, y al lector no le sirven de
 * nada que no le diga ya el orden de importancia. Es la misma línea que §69
 * trazó para el reparto de puntos de la auditoría — dimensiones y umbrales de
 * comportamiento sí, reparto exacto no.
 *
 * **Los códigos ADR** son peor: son la referencia interna de un documento que
 * el lector no puede abrir. Como "fuente" de una cifra no acredita nada,
 * porque no es verificable desde fuera; sólo enseña el índice de nuestras
 * decisiones internas.
 *
 * Cubre las cinco superficies de contenido público —artículos, glosario,
 * `/docs`, comparativas y las páginas de `/gratis`— porque el error se propagó
 * copiando la cabecera de la pieza anterior: cinco artículos lo tenían, tres de
 * ellos con la fórmula v2 ya retirada encima, y la tabla de pesos seguía además
 * en la metodología publicada, que es justo donde los artículos mandaban al
 * lector a buscarla.
 *
 * `/gratis` entró con FREE-CHECKER-1: es una superficie pública NUEVA, la
 * primera que se dirige a alguien sin cuenta, y nació fuera de esta lista. Una
 * superficie que nadie vigila es exactamente cómo llegaron aquí las otras
 * cuatro — se añade al crearla, no cuando se le escape algo.
 */
const CONTENT_SOURCES: { label: string; text: string }[] = [
  ...BLOG_POSTS.map((post) => ({
    label: `blog/${post.slug}`,
    text: readArticle(post.slug)
  })),
  {
    label: "lib/glosario/terms.ts",
    // Sólo la prosa publicada: `slug`/`href` no son texto de cara al lector.
    text: GLOSSARY_TERMS.map((t) => `${t.definition}\n${t.longDefinition}\n${t.relatedLinks.map((l) => l.label).join("\n")}`).join("\n")
  },
  // `/docs` entró el 2026-08-13 con la decisión de retirar los pesos también
  // de la metodología publicada (log §75): era la única superficie que aún los
  // enseñaba, y la que los artículos enlazaban.
  ...docsPages(),
  ...(existsSync(join(process.cwd(), "lib", "comparativas"))
    ? readdirSync(join(process.cwd(), "lib", "comparativas"))
        .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
        .map((f) => ({
          label: `lib/comparativas/${f}`,
          text: readFileSync(join(process.cwd(), "lib", "comparativas", f), "utf8")
        }))
    : []),
  // FREE-CHECKER-1: las páginas públicas de `/gratis`. Se leen enteras (TSX
  // incluido) a propósito: el comentario de cabecera de un fichero de producto
  // sí puede citar un ADR —es documentación interna— pero el copy no, y
  // separar ambos aquí exigiría un parser. Preferimos el falso positivo: si
  // salta, se reescribe el comentario, que es barato.
  ...(existsSync(join(process.cwd(), "app", "gratis"))
    ? readdirSync(join(process.cwd(), "app", "gratis"), { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => join(process.cwd(), "app", "gratis", e.name, "page.tsx"))
        .filter((f) => existsSync(f))
        .map((f) => ({
          label: `app/gratis/${f.split("/").slice(-2)[0]}`,
          text: readFileSync(f, "utf8")
        }))
    : [])
];

/** Un código ADR citado como fuente de cara al lector. */
export function citaCodigoAdr(text: string): string[] {
  return [...text.matchAll(/ADR[\s-]?\d{3,4}/g)].map((m) => m[0]);
}

/**
 * Un peso del compuesto publicado. No basta con buscar "%": el contenido está
 * lleno de porcentajes legítimos (cuotas de voz de ejemplo, tasas de mención,
 * datos de mercado). Lo que se persigue es el porcentaje **presentado como
 * cuánto pesa algo dentro del cálculo**.
 */
export function publicaUnPeso(text: string): string[] {
  // El porcentaje tiene que ir acompañado del vocabulario del compuesto. Sin
  // esa condición el detector marcaba una afirmación legítima sobre un
  // competidor ("aumenta el peso de la página … hasta en un 98%"), y un
  // guardián que da falsos positivos se desactiva a la primera.
  const COMPUESTO = "(GEO Score|score|f\u00f3rmula|compuesto|se\u00f1al(es)?|componente)";
  const patrones = [
    new RegExp(`pes(a|an|o|os)\\b[^.\\n]{0,60}?\\d{1,3}\\s?%[^.\\n]{0,60}?\\b${COMPUESTO}\\b`, "gi"),
    new RegExp(`\\b${COMPUESTO}\\b[^.\\n]{0,60}?pes(a|an|o|os)\\b[^.\\n]{0,40}?\\d{1,3}\\s?%`, "gi"),
    /\d{1,3}\s?%[^.\n]{0,40}?\bdel (total|GEO Score|score)\b/gi,
    /\bcon un peso (fijo|de \d)/gi,
    /Peso de (la|el) (presencia|prominencia|cuota|autoridad|preparaci\u00f3n)/gi
  ];
  return patrones.flatMap((p) => [...text.matchAll(p)].map((m) => m[0].trim()));
}

/**
 * Segunda revisión del fundador (2026-08-13, log §76), después de encontrar
 * "una media ponderada de cinco señales" viva en el pilar:
 *
 * > *"No digas cosas concretas de ninguna parte del producto. […] Además de
 * > desvelar cómo se calcula la métrica principal le resta valor, lo
 * > simplifica demasiado. […] haz que las afirmaciones sean más etéreas, más
 * > genéricas."*
 *
 * La primera pasada quitó los pesos y los códigos ADR, pero dejó la
 * **mecánica**: cuántas señales son, que es una media ponderada, que se
 * renormaliza al faltar una, y los umbrales exactos con los que decidimos qué
 * publicar. Eso sigue siendo el interior de la máquina — y, como dice el
 * fundador, contarlo abarata la métrica: un número que se explica en una
 * frase parece que se puede reproducir en una tarde.
 *
 * La línea que queda: **el contenido explica el problema y el criterio; no
 * explica nuestra máquina.** Qué mira el producto, sí. Cómo lo combina y con
 * qué umbrales, no.
 */
export function publicaLaMecanica(text: string): string[] {
  const patrones = [
    /media ponderada/gi,
    /\b(cinco|cuatro)\s+(se\u00f1ales|componentes)/gi,
    /se calcula combinando/gi,
    /(renormaliz|se reparte su peso|reparte su peso proporcionalmente)/gi,
    /mediana de (tus|los) (tres|\d+)/gi
  ];
  return patrones.flatMap((p) => [...text.matchAll(p)].map((m) => m[0].trim()));
}

describe("el contenido público no publica configuración interna del producto", () => {
  it("hay superficies que auditar", () => {
    expect(CONTENT_SOURCES.length).toBeGreaterThan(10);
  });

  for (const source of CONTENT_SOURCES) {
    it(`no cita códigos ADR: ${source.label}`, () => {
      expect(
        citaCodigoAdr(source.text),
        `${source.label} cita un ADR de cara al lector. Es la referencia interna de un ` +
          'documento que no puede abrir: como fuente, usa "Metodología de GenScore" o ' +
          "la evidencia real (un incidente fechado, datos de ejemplo declarados)."
      ).toEqual([]);
    });

    it(`no explica la mecánica del compuesto: ${source.label}`, () => {
      expect(
        publicaLaMecanica(source.text),
        `${source.label} explica cómo se construye la métrica por dentro. Decisión del ` +
          "fundador (log §76): el contenido dice QUÉ mira el producto, no cómo lo combina."
      ).toEqual([]);
    });

    it(`no publica los pesos del compuesto: ${source.label}`, () => {
      expect(
        publicaUnPeso(source.text),
        `${source.label} publica el reparto de pesos del GEO Score. Decisión del ` +
          "fundador (log §75): el orden de importancia sí, el reparto exacto no."
      ).toEqual([]);
    });
  }
});

describe("los detectores de configuración interna funcionan", () => {
  it("encuentra un código ADR escrito de las tres formas", () => {
    expect(citaCodigoAdr("fuente: ADR-0024 · capa")).toEqual(["ADR-0024"]);
    expect(citaCodigoAdr("ver ADR 0033 para el detalle")).toEqual(["ADR 0033"]);
    expect(citaCodigoAdr("no hay ninguno aquí")).toEqual([]);
  });

  it("detecta la mecánica del compuesto y deja pasar la prosa normal", () => {
    expect(publicaLaMecanica("es una media ponderada de cinco señales").length).toBe(2);
    expect(publicaLaMecanica("se calcula combinando cuatro componentes").length).toBe(2);
    expect(publicaLaMecanica("la mediana de tus tres últimos escaneos").length).toBe(1);
    expect(publicaLaMecanica("resume varias señales en un solo número")).toEqual([]);
    expect(publicaLaMecanica("mira si te nombran y con qué protagonismo")).toEqual([]);
  });

  it("distingue un peso publicado de un porcentaje legítimo", () => {
    expect(publicaUnPeso("la autoridad pesa un 15% del GEO Score").length).toBeGreaterThan(0);
    expect(publicaUnPeso("cada una con un peso fijo: presencia con un 40%").length).toBeGreaterThan(0);
    expect(publicaUnPeso('<Stat value="25%" label="Peso de la prominencia" />').length).toBeGreaterThan(0);
    // Legítimos: resultados medidos o de ejemplo, no reparto de la fórmula.
    expect(publicaUnPeso("tu cuota de voz de ejemplo es del 21%")).toEqual([]);
    expect(publicaUnPeso("apareces en el 72% de las respuestas")).toEqual([]);
    expect(publicaUnPeso("los chats de IA mandan ~1% de las visitas")).toEqual([]);
  });
});
