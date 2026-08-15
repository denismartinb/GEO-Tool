import { BLOG_POSTS, BLOG_CLUSTERS } from "@/lib/blog/posts";
import { GLOSSARY_TERMS } from "@/lib/glosario/terms";
import { DOCS_NAV } from "@/lib/docs/nav";
import { SITE_URL } from "./metadata";

/**
 * Constructor de `/llms.txt` (SEO-POS-1, T6).
 *
 * Antes era un fichero estático en `public/`, mantenido a mano, y había
 * derivado hasta listar 5 de 10 artículos, 1 de 3 comparativas y ninguna de
 * las 15 páginas de glosario. Es precisamente el fichero sobre el que el
 * producto publica una guía: que estuviera rancio no era solo un problema de
 * cobertura, era un problema de credibilidad.
 *
 * Se genera desde las mismas fuentes de verdad que el sitemap, así que una
 * pieza nueva entra sola. `llms-txt.test.ts` exige que no falte ninguna.
 */

/** Comparativas publicadas. No tienen SSOT propia de rutas — esta es la lista. */
export const COMPARATIVAS = [
  {
    path: "/comparativas/mejores-herramientas-geo-en-espanol",
    title: "Las mejores herramientas GEO en 2026",
    note: "comparativa de las herramientas de visibilidad en IA, con precios."
  },
  {
    path: "/comparativas/genscore-vs-otterly",
    title: "GenScore vs Otterly",
    note: "comparativa honesta, incluidas las filas donde gana Otterly."
  },
  {
    path: "/comparativas/genscore-vs-peec-ai",
    title: "GenScore vs Peec AI",
    note: "comparativa honesta, incluidas las filas donde gana Peec AI."
  },
  {
    path: "/comparativas/genscore-vs-profound",
    title: "GenScore vs Profound",
    note: "comparativa honesta, incluidas las filas donde gana Profound."
  },
  {
    path: "/comparativas/alternativas-a-otterly",
    title: "Alternativas a Otterly en 2026",
    note: "cinco alternativas ordenadas por el límite que te hace buscarlas, con lo que cada una no resuelve."
  }
] as const;

function line(title: string, path: string, note?: string): string {
  return `- [${title}](${SITE_URL}${path})${note ? `: ${note}` : ""}`;
}

export function buildLlmsTxt(): string {
  const sections: string[] = [];

  sections.push(
    `# GenScore

> GenScore mide y mejora cómo aparece una marca en las respuestas de
> asistentes de IA (ChatGPT, Gemini, Claude): GEO (Generative Engine
> Optimization). Escanea prompts reales de tu categoría, calcula un GEO
> Score compuesto (presencia, prominencia, cuota de voz y autoridad) y
> genera recomendaciones concretas para mejorar.`
  );

  sections.push(
    `## Producto

${line("Qué es el GEO", "/geo", "guía visual de Generative Engine Optimization.")}
${line("Precios", "/pricing", "planes Free, Starter, Pro y Agencia.")}
${line("Prueba gratis", "/signup", "registro con 7 días de prueba de Pro.")}`
  );

  sections.push(
    `## Docs

${line("Documentación", "/docs", "índice.")}
${DOCS_NAV.flatMap((section) =>
  section.pages.map((page) => line(page.title, `/docs/${page.slug}`, page.description))
).join("\n")}`
  );

  sections.push(
    `## Comparativas

${line("Comparativas", "/comparativas", "índice.")}
${COMPARATIVAS.map((c) => line(c.title, c.path, c.note)).join("\n")}`
  );

  sections.push(
    `## Blog

${line("Blog", "/blog", "índice por cluster temático.")}
${BLOG_CLUSTERS.map((c) => line(c.title, `/blog/${c.key}`, c.description)).join("\n")}
${BLOG_POSTS.map((p) => line(p.title, `/blog/${p.slug}`, p.description)).join("\n")}`
  );

  sections.push(
    `## Glosario

${line("Glosario GEO", "/glosario", "términos clave explicados en una frase.")}
${GLOSSARY_TERMS.map((t) => line(t.term, `/glosario/${t.slug}`, t.definition)).join("\n")}`
  );

  sections.push(
    `## Legal

${line("Privacidad", "/privacidad")}
${line("Cookies", "/cookies")}
${line("Términos", "/terminos")}`
  );

  return `${sections.join("\n\n")}\n`;
}
