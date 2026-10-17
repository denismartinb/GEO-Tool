import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MARKETING_CONTENT_LINKS,
  MARKETING_ENTITY_LINKS,
  MARKETING_LEAD_LINKS,
  MARKETING_SHELLS,
  PUBLIC_FOOTER_GROUPS,
  PUBLIC_FOOTER_LEGAL_LINKS
} from "./marketing-content-links";

/**
 * SEO-POS-1 (T3). El fallo que este test impide repetir: `/glosario` y
 * `/comparativas` se publicaron (GROWTH-2 2.4) sin entrar en ningún pie de
 * página, así que 21 URLs quedaron sin un solo enlace entrante desde el resto
 * del sitio. Nada avisó porque `article-links.test.ts` comprueba que los
 * enlaces que existen resuelvan, no que las superficies publicadas estén
 * enlazadas.
 *
 * La regla que se protege: todo shell de marketing enlaza las cuatro capas de
 * contenido desde la lista compartida, no desde una copia a mano.
 */

const ROOT = process.cwd();

describe("MARKETING_CONTENT_LINKS", () => {
  it("cubre las cuatro superficies de contenido de content-strategy §2", () => {
    expect(MARKETING_CONTENT_LINKS.map((l) => l.href)).toEqual([
      "/blog",
      "/docs",
      "/glosario",
      "/comparativas"
    ]);
  });

  it("apunta solo a rutas que existen de verdad", () => {
    for (const link of MARKETING_CONTENT_LINKS) {
      const dir = join(ROOT, "app", link.href.replace(/^\//, ""));
      const hasPage =
        existsSync(join(dir, "page.tsx")) || existsSync(join(dir, "page.mdx"));
      expect(hasPage, `${link.href} no tiene página en app/`).toBe(true);
    }
  });

  it("no lleva etiquetas vacías", () => {
    for (const link of MARKETING_CONTENT_LINKS) {
      expect(link.label.trim().length).toBeGreaterThan(0);
    }
  });
});

/**
 * FOOTER-UNIFY-1 (log §312). Each shell used to write its own `<footer>` and
 * there were seven versions; the rule now is that every shell renders the one
 * `PublicFooter` and none declares a footer of its own.
 */
const FOOTER_COMPONENT = "components/marketing/public-footer.tsx";
const FOOTER_HREFS = PUBLIC_FOOTER_GROUPS.flatMap((g) => g.links.map((l) => l.href));

describe("pies de página de marketing", () => {
  for (const shell of MARKETING_SHELLS) {
    it(`${shell} renderiza el pie único`, () => {
      const source = readFileSync(join(ROOT, shell), "utf8");
      expect(source.includes("<PublicFooter />"), `${shell} no renderiza <PublicFooter />`).toBe(true);
      expect(source.includes("<footer"), `${shell} declara su propio <footer>`).toBe(false);
    });
  }

  it("ninguna otra página pública escribe un <footer> a mano", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          // The console, the operator pages and the printable report have no public footer.
          if (!/^app\/(dashboard|admin|informe|api)$/.test(rel)) walk(rel);
        } else if (rel.endsWith(".tsx") && !rel.endsWith(".test.tsx") && rel !== FOOTER_COMPONENT) {
          if (readFileSync(join(ROOT, rel), "utf8").includes("<footer")) offenders.push(rel);
        }
      }
    };
    walk("app");
    walk("components");
    expect(offenders).toEqual([]);
  });

  it("el pie pinta las columnas y la línea legal compartidas", () => {
    const source = readFileSync(join(ROOT, FOOTER_COMPONENT), "utf8");
    expect(source).toContain("PUBLIC_FOOTER_GROUPS");
    expect(source).toContain("PUBLIC_FOOTER_LEGAL_LINKS");
  });

  it("cada enlace de las tres listas compartidas está en el pie una sola vez", () => {
    for (const link of [...MARKETING_CONTENT_LINKS, ...MARKETING_ENTITY_LINKS, ...MARKETING_LEAD_LINKS]) {
      expect(FOOTER_HREFS.filter((h) => h === link.href).length, `${link.href} en el pie`).toBe(1);
    }
  });

  it("no repite ningún enlace", () => {
    const all = [...FOOTER_HREFS, ...PUBLIC_FOOTER_LEGAL_LINKS.map((l) => l.href)];
    expect(new Set(all).size).toBe(all.length);
  });

  it("incluye el comprobador, la videollamada, Cookies y el programa de afiliados", () => {
    expect(FOOTER_HREFS).toContain("/gratis/aparece-mi-marca-en-chatgpt");
    expect(FOOTER_HREFS).toContain("/demo");
    expect(FOOTER_HREFS).toContain("/afiliados");
    expect(PUBLIC_FOOTER_LEGAL_LINKS.map((l) => l.href)).toContain("/cookies");
    expect(MARKETING_LEAD_LINKS.find((l) => l.href === "/afiliados")?.label).toBe("Programa de afiliados");
  });

  it("cada ruta del pie existe de verdad", () => {
    const paths = [...FOOTER_HREFS, ...PUBLIC_FOOTER_LEGAL_LINKS.map((l) => l.href)]
      .filter((h) => !h.startsWith("/#"));
    for (const href of paths) {
      const dir = join(ROOT, "app", href.replace(/^\//, ""));
      const hasPage = existsSync(join(dir, "page.tsx")) || existsSync(join(dir, "page.mdx"));
      expect(hasPage, `${href} no tiene página en app/`).toBe(true);
    }
  });
});

/**
 * SEO-POS-1 (T11). El enlace al feed se publicó una primera vez dentro del
 * párrafo descriptivo del blog y era invisible: la regla global es
 * `a { color: inherit; text-decoration: none }` y `.legal-updated` pinta en
 * `--ink-4`, así que el enlace salía del mismo gris que la frase que lo rodeaba
 * (lo reportó el fundador, 2026-08-09). Un enlace que existe en el HTML pero
 * que nadie distingue del texto no está publicado.
 */
describe("descubrimiento del feed RSS", () => {
  const source = readFileSync(join(ROOT, "app/blog/page.tsx"), "utf8");

  it("el índice del blog enlaza /feed.xml", () => {
    expect(source).toContain('href="/feed.xml"');
  });

  it("el enlace lleva una clase de enlace, no el color heredado del texto", () => {
    const anchor = source.slice(source.indexOf('href="/feed.xml"'));
    expect(
      anchor.slice(0, 120).includes("link-mini"),
      "el enlace al feed no usa .link-mini y heredaría el color del contenedor"
    ).toBe(true);
  });
});

/**
 * SEO-POS-1 Fase E, E2 (log §92). `MARKETING_ENTITY_LINKS` resuelve el mismo
 * problema que la lista de contenido —enlace entrante desde todos los pies sin
 * seis copias que se desincronizan— así que necesita la misma protección. Se
 * comprueba aparte y no ampliando el test de arriba porque aquél fija las
 * cuatro capas de `content-strategy.md` §2 por igualdad exacta, y la página de
 * entidad no es una capa de contenido.
 */
describe("MARKETING_ENTITY_LINKS", () => {
  it("contiene la página de entidad", () => {
    expect(MARKETING_ENTITY_LINKS.map((l) => l.href)).toContain("/que-es-genscore");
  });

  it("contiene «Quiénes somos» (GEO-SELF-1)", () => {
    expect(MARKETING_ENTITY_LINKS.map((l) => l.href)).toContain("/sobre-genscore");
    expect(MARKETING_ENTITY_LINKS.map((l) => l.href)).toContain("/estudios");
  });

  it("apunta solo a rutas que existen de verdad", () => {
    for (const link of MARKETING_ENTITY_LINKS) {
      expect(
        existsSync(join(process.cwd(), "app", link.href.replace(/^\//, ""), "page.tsx")),
        `${link.href} no tiene page.tsx`
      ).toBe(true);
    }
  });

});

/**
 * FREE-REPORT-2 (log §252) and AFFILIATES-1: the acquisition pages. Every
 * entry lands in `PUBLIC_FOOTER_GROUPS`, so it reaches every public footer.
 */
describe("MARKETING_LEAD_LINKS", () => {
  it("contiene el informe gratis y el programa de afiliados", () => {
    expect(MARKETING_LEAD_LINKS.map((l) => l.href)).toEqual(["/gratis/informe-geo", "/afiliados"]);
  });

  it("apunta solo a rutas que existen de verdad", () => {
    for (const link of MARKETING_LEAD_LINKS) {
      expect(
        existsSync(join(process.cwd(), "app", link.href.replace(/^\//, ""), "page.tsx")),
        `${link.href} no tiene page.tsx`
      ).toBe(true);
    }
  });

});
