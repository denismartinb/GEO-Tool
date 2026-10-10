import { describe, expect, it } from "vitest";
import { formatIsoDateEs, uniqueSources } from "./sources";

describe("sources", () => {
  it("formatea la fecha ISO en castellano", () => {
    expect(formatIsoDateEs("2026-10-09")).toBe("9 de octubre de 2026");
    expect(formatIsoDateEs("2026-01-31")).toBe("31 de enero de 2026");
  });

  it("quita duplicados por URL conservando el orden", () => {
    const a = { label: "A", url: "https://a", consulted: "2026-10-09", primary: true };
    const b = { label: "B", url: "https://b", consulted: "2026-10-09", primary: false };
    expect(uniqueSources([a, b, a]).map((s) => s.label)).toEqual(["A", "B"]);
  });
});
