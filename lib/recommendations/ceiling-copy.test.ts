import { describe, expect, it } from "vitest";
import { CEILING_LABEL, overviewCeilingSubtitle, planCeilingSuffix } from "./ceiling-copy";

describe("ceiling copy", () => {
  it("never promises a result: no 'potenciales', no 'lo confirma', and it says it is not a forecast", () => {
    const texts = [CEILING_LABEL, overviewCeilingSubtitle(13), overviewCeilingSubtitle(1), overviewCeilingSubtitle(null), planCeilingSuffix(3, "22")];
    for (const t of texts) expect(t).not.toMatch(/potencial|confirma|garantiz|hasta \+/i);
    expect(overviewCeilingSubtitle(13)).toMatch(/no es una previsión/i);
  });

  it("names the scope of each figure, so +87 and +22 stop looking like a contradiction", () => {
    expect(overviewCeilingSubtitle(13)).toContain("13 recomendaciones activas");
    expect(planCeilingSuffix(3, "22")).toContain("estas 3");
    expect(planCeilingSuffix(1, "5")).toContain("esta acción");
  });
});
