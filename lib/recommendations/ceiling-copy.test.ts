import { describe, expect, it } from "vitest";
import { planCeilingSuffix } from "./ceiling-copy";

describe("ceiling copy", () => {
  it("never promises a result and names its scope", () => {
    const t = planCeilingSuffix(3, "22");
    expect(t).not.toMatch(/potencial|confirma|garantiz|hasta \+/i);
    expect(t).toContain("Techo teórico de estas 3");
    expect(planCeilingSuffix(1, "5")).toContain("esta acción");
  });
});
