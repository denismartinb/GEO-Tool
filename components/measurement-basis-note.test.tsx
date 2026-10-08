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

  describe("the opened detail", () => {
    const sensitivity = { gemini: { score_without: 40.04, delta: -11.5 }, claude: { score_without: 58, delta: 6.46 } };
    const open = () =>
      renderToStaticMarkup(
        <MeasurementBasisNote
          basis={basis}
          confidenceReason="Media: 16 respuestas, 16 analizadas sin error."
          sensitivity={sensitivity}
          defaultOpen
        />
      );

    it("renders open, and every section of the detail is there when it is", () => {
      const html = open();
      expect(html).toMatch(/<details[^>]*\bopen(="")?[ >]/);
      for (const text of [
        "Base de esta medición",
        "6 respuestas válidas de 12 esperadas",
        "2 preguntas distintas con respuesta, de 3 pedidas",
        "gemini-2.5-flash",
        "claude-haiku-4-5-20251001",
        "con búsqueda web",
        "sin búsqueda web",
        "Medición parcial",
        "Confianza.",
        "Si faltara un motor.",
        "Sin Gemini: 40,0 (−11,5)",
        "no es una predicción",
        MEASUREMENT_API_LIMIT_NOTICE
      ]) {
        expect(html, text).toContain(text);
      }
    });

    it("uses --ink-3 or darker for every line of text, never the faint --ink-4", () => {
      expect(open()).not.toContain("ink-4");
    });

    it("stays collapsed unless asked, and has the same content either way", () => {
      const closed = renderToStaticMarkup(
        <MeasurementBasisNote basis={basis} confidenceReason="Media." sensitivity={sensitivity} />
      );
      expect(closed).not.toMatch(/<details[^>]*\bopen\b/);
      expect(closed).toContain("Si faltara un motor.");
    });
  });
});
