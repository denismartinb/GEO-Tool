import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MeasurementBasisNote } from "@/components/measurement-basis-note";
import { MEASUREMENT_API_LIMIT_NOTICE, buildMeasurementBasis } from "@/lib/scoring/measurement-basis";
import { fixtureMeasurementRows } from "@/lib/scoring/measurement-basis.fixtures";

// A run that answered 2 of the 3 questions it asked, with the engines unevenly
// answered: the note must not read as a whole measurement.
const basis = buildMeasurementBasis(
  fixtureMeasurementRows({ prompts: ["q1", "q2"], engines: ["gemini", "claude"], samples: 2 }).filter(
    (row) => !(row.provider === "claude" && row.prompt_text_snapshot === "q2")
  ),
  { expectedResponses: 12, requestedPrompts: 3 }
);

describe("MeasurementBasisNote", () => {
  it("shows valid vs expected, question breadth, models, grounding and the confidence reason", () => {
    const html = renderToStaticMarkup(
      <MeasurementBasisNote
        basis={basis}
        confidenceReason="Baja: solo 6 de 8 respuestas se pudieron analizar sin error."
        sensitivity={{ gemini: { score_without: 40.04, delta: -11.5 }, claude: { score_without: 58, delta: 6.46 } }}
      />
    );

    expect(html).toContain("6 respuestas válidas de 12 esperadas: faltan 6, y no se rellenan.");
    expect(html).toContain("2 preguntas distintas con respuesta, de 3 pedidas, repetidas hasta 2 veces.");
    expect(html).toContain("gemini-2.5-flash");
    expect(html).toContain("con búsqueda web");
    expect(html).toContain("sin búsqueda web");
    expect(html).toContain("Medición parcial: los motores no respondieron las mismas preguntas");
    expect(html).toContain("Baja: solo 6 de 8");
    expect(html).toContain("Sin Gemini: 40,0 (−11,5)");
    expect(html).toContain("Sin Claude: 58,0 (+6,5)");
    expect(html).toContain("no es una predicción");
  });

  it("always carries the API limit, even for a run that recorded no basis", () => {
    const html = renderToStaticMarkup(<MeasurementBasisNote basis={null} confidenceReason={null} sensitivity={null} />);

    expect(html).toContain("se midió antes de que se registrara su base");
    expect(html).toContain(MEASUREMENT_API_LIMIT_NOTICE.replace(/&/g, "&amp;"));
    expect(html).not.toContain("Si faltara un motor");
  });

  it("is collapsed by default", () => {
    const html = renderToStaticMarkup(<MeasurementBasisNote basis={basis} confidenceReason={null} sensitivity={null} />);
    expect(html).not.toMatch(/<details[^>]*\bopen\b/);
  });
});
