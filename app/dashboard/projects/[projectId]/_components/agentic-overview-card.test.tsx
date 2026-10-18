import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/agentic-audit/console-audit", () => ({ readAgenticAudits: vi.fn() }));

import { AgenticOverviewCardView } from "./agentic-overview-card";

/**
 * AGENTIC-COMMERCE-1 Fase 2b (log §340): render tests of the «Comercio
 * agéntico» card on Visión general. They pin content, never looks.
 */

const CARD = {
  kind: "card" as const,
  score: 54,
  headline: "Lo que más frena a un agente es entrar en tu web.",
  components: [
    { id: "discovery" as const, name: "Descubrimiento", points: 14, weight: 30, percent: 47 },
    { id: "understanding" as const, name: "Comprensión", points: 19, weight: 30, percent: 63 },
    { id: "trust" as const, name: "Confianza", points: null, weight: 20, percent: 0 },
    { id: "purchase" as const, name: "Compra", points: 8, weight: 20, percent: 40 }
  ],
  first: { title: "Deja pasar a los asistentes de compra", tone: "bad" as const }
};

describe("AgenticOverviewCardView", () => {
  it("renders nothing when hidden", () => {
    expect(renderToStaticMarkup(<AgenticOverviewCardView projectId="p1" card={{ kind: "hidden" }} />)).toBe("");
  });

  it("Starter sees the invitation to Pro with the plan deep link", () => {
    const html = renderToStaticMarkup(<AgenticOverviewCardView projectId="p1" card={{ kind: "upsell" }} />);
    expect(html).toContain("Comercio agéntico");
    expect(html).toContain("Pasar a Pro");
    expect(html).toContain('href="/dashboard/settings?openPlan=pro#plan"');
    expect(html).not.toContain("Ver todo");
  });

  it("shows the score, the four components, the first fix without points and links to the summary", () => {
    const html = renderToStaticMarkup(<AgenticOverviewCardView projectId="p1" card={CARD} />);
    expect(html).toContain("Visibilidad agéntica 54 de 100");
    expect(html).toContain(CARD.headline);
    for (const name of ["Descubrimiento", "Comprensión", "Confianza", "Compra"]) expect(html).toContain(name);
    expect(html).toContain("14<small>/30</small>");
    expect(html).toContain("–<small>/20</small>");
    expect(html).toContain("Lo primero");
    expect(html).toContain(CARD.first.title);
    expect(html).not.toMatch(/\+\d/);
    expect(html).not.toContain("Interoperabilidad");
    expect(html).toContain('href="/dashboard/projects/p1/agentic-visibility"');
    expect(html).toContain("No entra en tu Puntuación GEO");
  });
});
