import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MARKETING_CONTENT_LINKS, MARKETING_ENTITY_LINKS } from "./marketing-content-links";

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

/** Cada shell de marketing con pie de página público. */
const MARKETING_SHELLS = [
  "components/landing/landing-page.tsx",
  "components/pricing/pricing-page.tsx",
  "components/blog/blog-page-shell.tsx",
  "components/docs/docs-page-shell.tsx",
  "components/legal-page-shell.tsx",
  // NOT-FOUND-ROCKET-1: la 404 pública tiene su propio shell (no reutiliza
  // BlogPageShell porque `.lp-inner` impide la escena a sangre), así que es
  // una superficie más con pie público — justo la clase de sitio donde se
  // olvidan las cuatro capas de contenido.
  "components/not-found-mission.tsx"
];

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

/** El bloque `<footer>…</footer>` del shell, que es donde aplica la regla. */
function footerBlockOf(shell: string): string {
  const source = readFileSync(join(ROOT, shell), "utf8");
  const start = source.indexOf("<footer");
  const end = source.indexOf("</footer>", start);
  if (start === -1 || end === -1) {
    throw new Error(`${shell} no tiene un bloque <footer> reconocible`);
  }
  return source.slice(start, end);
}

describe("pies de página de marketing", () => {
  for (const shell of MARKETING_SHELLS) {
    it(`${shell} renderiza la lista compartida en su pie`, () => {
      expect(
        footerBlockOf(shell).includes("MARKETING_CONTENT_LINKS"),
        `${shell} no usa MARKETING_CONTENT_LINKS en el pie`
      ).toBe(true);
    });

    it(`${shell} no duplica a mano un enlace que ya aporta la lista`, () => {
      const footer = footerBlockOf(shell);
      for (const link of MARKETING_CONTENT_LINKS) {
        // Solo dentro del pie: las navegaciones de cabecera enlazan /blog o
        // /docs a propósito y eso no es una duplicación.
        expect(
          footer.includes(`href="${link.href}"`),
          `${shell} enlaza ${link.href} a mano en el pie además de por la lista`
        ).toBe(false);
      }
    });
  }
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

  it("apunta solo a rutas que existen de verdad", () => {
    for (const link of MARKETING_ENTITY_LINKS) {
      expect(
        existsSync(join(process.cwd(), "app", link.href.replace(/^\//, ""), "page.tsx")),
        `${link.href} no tiene page.tsx`
      ).toBe(true);
    }
  });

  for (const shell of MARKETING_SHELLS) {
    it(`${shell} renderiza la lista de entidad en su pie`, () => {
      expect(
        footerBlockOf(shell).includes("MARKETING_ENTITY_LINKS"),
        `${shell} no usa MARKETING_ENTITY_LINKS en el pie, así que la página de entidad ` +
          "pierde su enlace entrante desde esa superficie"
      ).toBe(true);
    });
  }
});
