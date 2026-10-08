import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OpportunitiesCard } from "./opportunities-card";

const recs = [
  { id: "1", title: "Aparece en «¿Es rentable invertir…?»", impact: "medium", effort: "medium" },
  { id: "2", title: "Disputa a Profound 2 consultas donde no apareces", impact: "high", effort: "low" },
  { id: "3", title: "Añade un bloque de preguntas y respuestas", impact: "low", effort: "high" }
];

describe("OpportunitiesCard — sin cifras ni promesas (log §236)", () => {
  const html = renderToStaticMarkup(
    <OpportunitiesCard projectId="p1" recommendations={recs} activeCount={13} highPriorityCount={1} />
  );

  it("el titular es el recuento real, no una cifra de puntos", () => {
    expect(html).toContain("ov2-opps-gain-n\">13<");
    expect(html).toContain("Recomendaciones");
    expect(html).not.toMatch(/\+\d+|techo|potencial|pt</i);
  });

  it("cada fila enseña el impacto cualitativo y la rápida se marca", () => {
    expect(html).toContain("Impacto medio");
    expect(html).toContain("Impacto alto");
    expect(html).toContain("Impacto bajo");
    expect(html).toContain("rápida");
  });

  it("no promete recuperar visibilidad frente a nadie", () => {
    expect(html).not.toMatch(/ejecútalas|recuperar visibilidad/i);
    // "prioridad estimada", never "impacto en tu visibilidad": the order is a
    // product rule (planScore), not a measured effect.
    expect(html).toContain("Ordenadas por prioridad estimada.");
    expect(html).not.toMatch(/impacto en tu visibilidad/i);
  });

  it("singular cuando hay una sola", () => {
    const one = renderToStaticMarkup(
      <OpportunitiesCard projectId="p1" recommendations={recs.slice(0, 1)} activeCount={null} highPriorityCount={0} />
    );
    expect(one).toContain(">Recomendación<");
    expect(one).toContain("Acciones priorizadas para ti");
  });
});
