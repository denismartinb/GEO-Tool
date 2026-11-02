import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AiReadOverviewCard } from "./ai-read-card";

/** Content checks for the «Lo que lee la IA» card (AI-READ-2, log §451). */

const HREF = "/dashboard/projects/p1/web-audit?bloque=geo#lo-que-lee-la-ia";

describe("AiReadOverviewCard", () => {
  it("renders nothing when hidden", () => {
    expect(renderToStaticMarkup(<AiReadOverviewCard card={{ kind: "hidden" }} href={HREF} />)).toBe("");
  });

  it("shows the figure, the rows and the lost items, and never a page count", () => {
    const html = renderToStaticMarkup(
      <AiReadOverviewCard
        href={HREF}
        card={{
          kind: "card",
          pct: 72,
          headline: "Le llega el 72% de lo que ven tus clientes.",
          sub: "Lo que la IA no ve, no lo puede contar.",
          rows: [{ kind: "price", label: "Precios", reachPct: 20 }],
          title: "Lo que más se pierde",
          items: [{ text: "La IA no ve tus precios", tone: "warm" }]
        }}
      />
    );
    expect(html).toContain("72%");
    expect(html).toContain("Precios");
    expect(html).toContain("Lo que más se pierde");
    expect(html).toContain(HREF.replace("&", "&amp;"));
    expect(html).not.toMatch(/p[aá]ginas? (analizadas|medidas)/i);
  });

  it("says it is measuring without a figure", () => {
    const html = renderToStaticMarkup(<AiReadOverviewCard card={{ kind: "measuring" }} href={HREF} />);
    expect(html).toContain("midiendo");
    expect(html).not.toContain("Ver todo");
  });
});
