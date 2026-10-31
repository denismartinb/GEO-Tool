import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * CONSOLE-PAGE-TEMPLATE-1 (log §396): every console screen opens with the
 * shared head (title, one action in the same row, data sentence), no
 * «SECCIÓN · dominio» kicker and no counter next to the title.
 */
const read = (p: string) => readFileSync(p, "utf8");
const D = "app/dashboard/projects/[projectId]/";
const HEADS: Record<string, string> = {
  "Visión general": "components/ins/overview/blocks.tsx",
  Recomendaciones: `${D}recommendations/page.tsx`,
  Prompts: `${D}prompts/page.tsx`,
  Competidores: "components/ins/competitors/ins-competitors.tsx",
  "Páginas citadas": "components/ins/citations/ins-citations.tsx",
  "Posición en Google": `${D}search-console/page.tsx`,
  "Auditoría técnica": `${D}web-audit/page.tsx`,
  "Visibilidad en agentes": `${D}agentic-visibility/page.tsx`,
  "Auditoría agéntica": `${D}agentic-audit/page.tsx`,
};

describe("console page template", () => {
  for (const [screen, file] of Object.entries(HEADS)) {
    it(`${screen} uses PageHead and has no kicker`, () => {
      const src = read(file);
      expect(src).toContain("<PageHead");
      expect(src).not.toContain('className="eyebrow bare"');
    });
  }

  it("the head has no counter badge", () => {
    expect(read("components/ins/page-head.tsx")).not.toContain("badge");
  });

  it("recommendations: the pillars come after the actions", () => {
    const src = read(`${D}recommendations/page.tsx`);
    expect(src.indexOf('className="pillars"')).toBeGreaterThan(src.indexOf("{aiContent}"));
  });

  it("the head's actions keep a name when their label hides on a phone", () => {
    for (const file of [
      "components/ins/overview/blocks.tsx",
      "components/ins/competitors/ins-competitors.tsx",
      "components/ins/prompts/add-prompts.tsx",
    ]) {
      const src = read(file);
      expect(src).toContain('className="ph-lbl"');
      expect(src).toMatch(/aria-label="(Descargar informe|Gestionar competidores|Añadir prompts)"/);
    }
  });

  it("the template sheet loads after the screen sheets", () => {
    const layout = read("app/dashboard/layout.tsx");
    expect(layout.indexOf("app/ins/page-template.css")).toBeGreaterThan(layout.indexOf("app/ins/trial-ended.css"));
  });
});
