import { describe, expect, it } from "vitest";
import { buildLlmsFullTxt } from "./llms-full-txt";
import { COMPARATIVAS } from "./llms-txt";
import { SITE_URL } from "./metadata";
import { BLOG_POSTS, BLOG_CLUSTERS } from "@/lib/blog/posts";
import { GLOSSARY_TERMS } from "@/lib/glosario/terms";
import { DOCS_NAV } from "@/lib/docs/nav";
import { ABOUT_SECTIONS } from "@/lib/brand/about";
import { CANONICAL_DEFINITION_LONG } from "@/lib/brand/canonical-definition";
import { GEO_SCORE_DEFINITION } from "@/lib/brand/geo-score-definition";
import { QUE_ES_GENSCORE_FAQ } from "@/lib/brand/que-es-genscore-faq";
import { TOOLS } from "@/lib/comparativas/mejores-herramientas-geo";
import { COMPARISON_ROWS as OTTERLY_ROWS } from "@/lib/comparativas/genscore-vs-otterly";
import { ALTERNATIVES } from "@/lib/comparativas/alternativas-a-otterly";

/**
 * GEO-SELF-1 Fase 1. Mismo fallo que `llms-txt.test.ts` impide en el índice
 * (log §47): un fichero para LLMs que se queda atrás respecto a lo publicado
 * sin que nada avise. Aquí, además, el contenido tiene que ser LITERALMENTE el
 * de las fuentes de datos, no una segunda redacción.
 */
describe("buildLlmsFullTxt", () => {
  const content = buildLlmsFullTxt();

  it("abre con la definición canónica larga", () => {
    expect(content).toContain(CANONICAL_DEFINITION_LONG);
  });

  it("incluye todas las preguntas de /que-es-genscore con su respuesta", () => {
    for (const item of QUE_ES_GENSCORE_FAQ) {
      expect(content).toContain(item.question);
      expect(content).toContain(item.answer);
    }
  });

  it("incluye «Quiénes somos» entero", () => {
    expect(content).toContain(`${SITE_URL}/sobre-genscore`);
    for (const section of ABOUT_SECTIONS) {
      for (const paragraph of section.paragraphs) expect(content).toContain(paragraph);
    }
    expect(content).toContain("soporte@genscore.es");
  });

  it("incluye la definición compartida del GEO Score", () => {
    expect(content).toContain(GEO_SCORE_DEFINITION);
  });

  it("incluye las cinco comparativas con sus datos", () => {
    for (const comp of COMPARATIVAS) expect(content, `falta ${comp.path}`).toContain(`${SITE_URL}${comp.path}`);
    for (const tool of TOOLS) expect(content).toContain(tool.oneLiner);
    for (const row of OTTERLY_ROWS) expect(content).toContain(row.otterly);
    for (const alt of ALTERNATIVES) expect(content).toContain(alt.tradeoff);
  });

  it("marca las ventajas de los dos lados, como las tablas publicadas", () => {
    expect(content).toContain("(ventaja: GenScore)");
    expect(content).toContain("(ventaja: Otterly)");
  });

  it("incluye la definición larga de todos los términos del glosario", () => {
    for (const term of GLOSSARY_TERMS) {
      expect(content, `falta ${term.slug}`).toContain(`${SITE_URL}/glosario/${term.slug}`);
      expect(content).toContain(term.longDefinition);
    }
  });

  it("incluye todos los artículos, pilares y páginas de documentación", () => {
    for (const post of BLOG_POSTS) {
      expect(content, `falta ${post.slug}`).toContain(`${SITE_URL}/blog/${post.slug}`);
      expect(content).toContain(post.description);
    }
    for (const cluster of BLOG_CLUSTERS) expect(content).toContain(`${SITE_URL}/blog/${cluster.key}`);
    for (const section of DOCS_NAV) {
      for (const page of section.pages) expect(content).toContain(`${SITE_URL}/docs/${page.slug}`);
    }
  });

  it("no enlaza zonas privadas ni publica pesos del GEO Score", () => {
    expect(content).not.toContain("/dashboard");
    expect(content).not.toContain("/api/");
    // Los pesos del compuesto no se publican en ninguna superficie (log §75).
    expect(content).not.toMatch(/\.32\b|\.16\b|pesos? del (compuesto|GEO Score)/i);
  });

  it("es estable entre llamadas", () => {
    expect(buildLlmsFullTxt()).toBe(content);
  });
});
