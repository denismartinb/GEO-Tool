import { describe, expect, it } from "vitest";
import { readCompetitorPrefill } from "@/lib/competitors/prefill";

describe("readCompetitorPrefill (EXT-AUDITS-1, log §406)", () => {
  it("reads a well-formed domain and its name", () => {
    expect(readCompetitorPrefill({ nuevo: "www.vodafone.es", nombre: "Vodafone" })).toEqual({ domain: "vodafone.es", name: "Vodafone" });
  });
  it("falls back to the domain's first label", () => {
    expect(readCompetitorPrefill({ nuevo: "el-corte-ingles.es" })).toEqual({ domain: "el-corte-ingles.es", name: "El corte ingles" });
  });
  it("ignores anything that is not a domain, and cleans the name", () => {
    expect(readCompetitorPrefill({})).toBeNull();
    expect(readCompetitorPrefill({ nuevo: "<script>" })).toBeNull();
    expect(readCompetitorPrefill({ nuevo: "javascript:alert(1)" })).toBeNull();
    expect(readCompetitorPrefill({ nuevo: "marca.es", nombre: "<b>Marca</b>\n  SL" })?.name).toBe("bMarca/b SL");
  });
});
