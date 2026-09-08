import { describe, expect, it } from "vitest";

import { VARIABILITY_LABEL, variabilityNotice } from "@/lib/free-checker/result-copy";

describe("variabilityNotice", () => {
  it("tras un resultado NEGATIVO desmonta creerse ausente", () => {
    const notice = variabilityNotice({ engineLabel: "ChatGPT", brandMentioned: false });
    expect(notice.body).toContain("no se puede decir que no aparezcas");
    expect(notice.body).toContain("en ésta no apareciste");
  });

  it("tras un resultado POSITIVO desmonta creerse presente", () => {
    const notice = variabilityNotice({ engineLabel: "ChatGPT", brandMentioned: true });
    expect(notice.body).toContain("no se puede decir que aparezcas siempre");
    expect(notice.body).toContain("en ésta apareciste");
  });

  /**
   * El fallo exacto que encontró la auditoría (P0-07): el texto negativo
   * cerrando un resultado positivo. Se asserta como ausencia, porque es lo
   * único que impide que vuelva a colarse por un copy-paste.
   */
  it("NUNCA usa el texto negativo cuando la marca sí apareció", () => {
    const notice = variabilityNotice({ engineLabel: "ChatGPT", brandMentioned: true });
    expect(notice.body).not.toContain("no apareciste");
    expect(notice.body).not.toContain("que no aparezcas");
  });

  it("NUNCA usa el texto positivo cuando la marca no apareció", () => {
    const notice = variabilityNotice({ engineLabel: "ChatGPT", brandMentioned: false });
    expect(notice.body).not.toContain("aparezcas siempre");
  });

  it("mantiene la causa y el remedio idénticos en ambas direcciones", () => {
    const yes = variabilityNotice({ engineLabel: "ChatGPT", brandMentioned: true });
    const no = variabilityNotice({ engineLabel: "ChatGPT", brandMentioned: false });

    const cause = "busca en tiempo real y no es determinista";
    const remedy = "hacen falta varias preguntas repetidas en el tiempo";
    for (const notice of [yes, no]) {
      expect(notice.body).toContain(cause);
      expect(notice.body).toContain(remedy);
      expect(notice.label).toBe(VARIABILITY_LABEL);
    }
  });

  it("nombra el motor que respondió, no uno fijo", () => {
    expect(variabilityNotice({ engineLabel: "Gemini", brandMentioned: true }).body).toContain("Gemini");
    expect(variabilityNotice({ engineLabel: "Claude", brandMentioned: false }).body).toContain("Claude");
  });
});
