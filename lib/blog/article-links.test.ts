import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOG_CLUSTERS, BLOG_POSTS } from "./posts";
import { GLOSSARY_TERMS } from "../glosario/terms";
import { DOCS_NAV } from "../docs/nav";

/**
 * GROWTH-3 Fase 3.1 — integridad de enlaces internos.
 *
 * Regla del fundador (2026-08-03): "probar siempre todos los links". Este es
 * el primero de los dos niveles — el estático, que corre en cada `pnpm test`
 * y coge un enlace roto ANTES de desplegar. El segundo nivel vive en el
 * journey del ux-pilot y comprueba contra el despliegue real que cada enlace
 * responde 200.
 *
 * Este test recorre todo el contenido publicado (artículos MDX + páginas de
 * contenido TSX) y exige que cada href interno resuelva a una ruta que existe
 * de verdad. Un enlace a una ruta inventada rompe el build.
 */

const APP = join(process.cwd(), "app");

/** Rutas estáticas reales, derivadas del árbol de ficheros — no una lista a mano que se desincroniza. */
function staticRoutesFromFilesystem(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    // Segmentos dinámicos y agrupadores: se expanden aparte desde su SSOT.
    if (name.startsWith("[") || name.startsWith("(") || name.startsWith("_")) continue;
    // Zonas privadas o no navegables: no son destino de un enlace de artículo.
    if (["api", "auth", "dashboard"].includes(name)) continue;
    const route = `${prefix}/${name}`;
    const here = join(dir, name);
    if (existsSync(join(here, "page.tsx")) || existsSync(join(here, "page.mdx"))) out.push(route);
    out.push(...staticRoutesFromFilesystem(here, route));
  }
  return out;
}

const VALID_ROUTES = new Set<string>([
  "/",
  ...staticRoutesFromFilesystem(APP),
  ...BLOG_POSTS.map((p) => `/blog/${p.slug}`),
  // Páginas pilar de cluster (`app/blog/[cluster]`): segmento dinámico, así
  // que el barrido del sistema de ficheros no las ve. Mismo filtro que
  // `app/sitemap.ts`: un cluster sin `pillarIntro` no tiene página publicada y
  // enlazarlo sí sería un enlace roto. Sin esto, un artículo que enlaza a su
  // propio pilar —lo que exige content-strategy.md §4.3— fallaba este test
  // (SEO-POS-1 S6).
  ...BLOG_CLUSTERS.filter((c) => c.pillarIntro).map((c) => `/blog/${c.key}`),
  ...GLOSSARY_TERMS.map((t) => `/glosario/${t.slug}`),
  ...DOCS_NAV.flatMap((s) => s.pages.map((p) => `/docs/${p.slug}`))
]);

/** Ficheros de contenido publicado: artículos del blog y páginas de contenido. */
function contentFiles(): { label: string; path: string }[] {
  const files: { label: string; path: string }[] = [];
  const blogDir = join(APP, "blog");
  for (const entry of readdirSync(blogDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("[")) continue;
    const mdx = join(blogDir, entry.name, "page.mdx");
    if (existsSync(mdx)) files.push({ label: `blog/${entry.name}`, path: mdx });
  }
  for (const dir of ["comparativas", "glosario"]) {
    const base = join(APP, dir);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith("[")) continue;
      const tsx = join(base, entry.name, "page.tsx");
      if (existsSync(tsx)) files.push({ label: `${dir}/${entry.name}`, path: tsx });
    }
  }
  return files;
}

/** Extrae hrefs internos. Ignora externos, anclas puras, mailto/tel y plantillas dinámicas. */
function internalHrefs(source: string): string[] {
  const found = new Set<string>();
  for (const m of source.matchAll(/href=(?:"([^"]+)"|\{`([^`]+)`\})/g)) {
    const raw = m[1] ?? m[2] ?? "";
    if (!raw.startsWith("/")) continue;
    if (raw.includes("${")) continue; // interpolación: no se puede validar estáticamente
    const path = raw.split("#")[0].split("?")[0].replace(/\/$/, "") || "/";
    found.add(path);
  }
  return [...found];
}

const FILES = contentFiles();

describe("integridad de enlaces internos en contenido publicado", () => {
  it("encuentra ficheros de contenido que auditar", () => {
    expect(FILES.length).toBeGreaterThan(5);
  });

  it("el set de rutas válidas incluye las rutas base conocidas", () => {
    for (const route of ["/blog", "/glosario", "/docs", "/geo", "/pricing", "/comparativas"]) {
      expect(VALID_ROUTES.has(route), `${route} debería existir como ruta real`).toBe(true);
    }
  });

  for (const file of FILES) {
    it(`todos los enlaces internos resuelven: ${file.label}`, () => {
      const hrefs = internalHrefs(readFileSync(file.path, "utf8"));
      const broken = hrefs.filter((h) => !VALID_ROUTES.has(h));
      expect(broken, `${file.label} enlaza a rutas que no existen: ${broken.join(", ")}`).toEqual([]);
    });
  }
});

/**
 * El caso negativo: una guarda que no puede fallar no es una guarda. Estos
 * tests prueban el detector en sí, no el contenido — si el extractor dejara
 * de encontrar hrefs, los tests de arriba pasarían vacíos y en verde.
 */
describe("el detector de enlaces rotos funciona", () => {
  it("marca como roto un enlace a una ruta inexistente", () => {
    const hrefs = internalHrefs('<a href="/ruta-que-no-existe">x</a>');
    expect(hrefs).toEqual(["/ruta-que-no-existe"]);
    expect(hrefs.filter((h) => !VALID_ROUTES.has(h))).toHaveLength(1);
  });

  it("acepta un enlace a una ruta real y normaliza ancla y barra final", () => {
    expect(internalHrefs('<a href="/glosario/geo#seccion">x</a>')).toEqual(["/glosario/geo"]);
    expect(internalHrefs('<a href="/blog/">x</a>')).toEqual(["/blog"]);
    expect(internalHrefs('<a href="/glosario/geo">x</a>').every((h) => VALID_ROUTES.has(h))).toBe(true);
  });

  it("ignora externos, anclas puras e interpolaciones dinámicas", () => {
    expect(internalHrefs('<a href="https://otterly.ai">x</a>')).toEqual([]);
    expect(internalHrefs('<a href="#faq">x</a>')).toEqual([]);
    expect(internalHrefs("<a href={`/blog/${post.slug}`}>x</a>")).toEqual([]);
  });

  it("extrae hrefs de la sintaxis JSX con plantilla literal estática", () => {
    expect(internalHrefs("<Link href={`/comparativas`}>x</Link>")).toEqual(["/comparativas"]);
  });
});
