import { describe, expect, it } from "vitest";
import { buildLlmsTxt, COMPARATIVAS } from "./llms-txt";
import { SITE_URL } from "./metadata";
import { BLOG_POSTS, BLOG_CLUSTERS } from "@/lib/blog/posts";
import { GLOSSARY_TERMS } from "@/lib/glosario/terms";
import { DOCS_NAV } from "@/lib/docs/nav";

/**
 * SEO-POS-1 (T6). El fallo que este test impide repetir: `public/llms.txt` se
 * mantenía a mano y acabó listando 5 de 10 artículos, 1 de 3 comparativas y
 * ninguna de las 15 páginas de glosario, sin que nada avisara. Es el fichero
 * sobre el que el propio producto publica una guía.
 */

describe("buildLlmsTxt", () => {
  const content = buildLlmsTxt();

  it("incluye todos los artículos publicados", () => {
    for (const post of BLOG_POSTS) {
      expect(content, `falta ${post.slug}`).toContain(`${SITE_URL}/blog/${post.slug}`);
    }
  });

  it("incluye los pilares de cluster", () => {
    for (const cluster of BLOG_CLUSTERS) {
      expect(content, `falta el cluster ${cluster.key}`).toContain(
        `${SITE_URL}/blog/${cluster.key}`
      );
    }
  });

  it("incluye todos los términos del glosario", () => {
    for (const term of GLOSSARY_TERMS) {
      expect(content, `falta ${term.slug}`).toContain(`${SITE_URL}/glosario/${term.slug}`);
    }
  });

  it("incluye todas las páginas de documentación", () => {
    for (const section of DOCS_NAV) {
      for (const page of section.pages) {
        expect(content, `falta ${page.slug}`).toContain(`${SITE_URL}/docs/${page.slug}`);
      }
    }
  });

  it("incluye todas las comparativas", () => {
    for (const comp of COMPARATIVAS) {
      expect(content, `falta ${comp.path}`).toContain(`${SITE_URL}${comp.path}`);
    }
  });

  it("no enlaza zonas privadas", () => {
    expect(content).not.toContain("/dashboard");
    expect(content).not.toContain("/api/");
  });

  it("es estable entre llamadas (sin fechas ni aleatoriedad)", () => {
    expect(buildLlmsTxt()).toBe(content);
  });

  it("usa siempre URLs absolutas del dominio real", () => {
    const links = content.match(/\]\(([^)]+)\)/g) ?? [];
    expect(links.length).toBeGreaterThan(30);
    for (const link of links) {
      expect(link).toContain(SITE_URL);
    }
  });
});
