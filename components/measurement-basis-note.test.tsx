import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MeasurementBasisNote } from "@/components/measurement-basis-note";
import { MEASUREMENT_API_LIMIT_NOTICE, readMeasurementBasis } from "@/lib/scoring/measurement-basis";

const basis = readMeasurementBasis({
  measurement_basis: {
    version: "measurement-basis-v1",
    responses: { valid: 8, clean: 6, expected: 12, missing: 4 },
    by_engine: {
      gemini: { responses: 4, models: ["gemini-2.5-flash"], grounded: true },
      claude: { responses: 4, models: ["claude-haiku-4-5-20251001"], grounded: false }
    },
    prompts: { distinct: 2, max_samples: 2, set_key: "abc" },
    locale: { countries: ["es"], languages: ["es"] }
  }
});

describe("MeasurementBasisNote", () => {
  it("shows valid vs expected, question breadth, models, grounding and the confidence reason", () => {
    const html = renderToStaticMarkup(
      <MeasurementBasisNote
        basis={basis}
        confidenceReason="Baja: solo 6 de 8 respuestas se pudieron analizar sin error."
        sensitivity={{ gemini: { score_without: 40.04, delta: -11.5 }, claude: { score_without: 58, delta: 6.46 } }}
      />
    );

    expect(html).toContain("8 respuestas válidas de 12 esperadas: faltan 4, y no se rellenan.");
    expect(html).toContain("2 preguntas distintas, cada una repetida hasta 2 veces.");
    expect(html).toContain("gemini-2.5-flash");
    expect(html).toContain("con búsqueda web");
    expect(html).toContain("sin búsqueda web");
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
