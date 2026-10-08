import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/llm/llm-incident", () => ({ reportLlmIncident: vi.fn() }));
vi.mock("@/lib/llm/gemini-client", () => ({
  generateGroundedGeminiJsonWithSources: vi.fn(),
  toIncidentError: (e: unknown) => e
}));

import { generateGroundedGeminiJsonWithSources } from "@/lib/llm/gemini-client";
import { suggestCompetitors } from "./competitor-suggestions-llm";

const PROFILE = {
  whatItSells: "x",
  sector: "x",
  subSector: "x",
  businessModel: "b2b" as const,
  targetCustomer: "x",
  geographicScope: "x",
  sizeEstimate: "x",
  confidence: "high" as const
};

const input = { brand: "GenScore", domain: "genscore.es", country: "ES", language: "es", profile: PROFILE };

beforeEach(() => vi.clearAllMocks());

describe("suggestCompetitors · fuentes", () => {
  it("adjunta la fuente sólo al competidor cuyo sitio fue consultado; el resto queda sin fuente", async () => {
    vi.mocked(generateGroundedGeminiJsonWithSources).mockResolvedValue({
      json: { competitors: [{ name: "Otterly", domain: "otterly.ai" }, { name: "Peec", domain: "peec.ai" }] },
      sources: [{ uri: "https://r/1", title: "otterly.ai" }, { uri: "https://r/2", title: "Guía GEO 2026" }]
    });

    const result = await suggestCompetitors(input);

    expect(result).toEqual([
      { name: "Otterly", domain: "otterly.ai", source: { uri: "https://r/1", title: "otterly.ai" } },
      { name: "Peec", domain: "peec.ai" }
    ]);
    expect(result[1]).not.toHaveProperty("source");
  });

  it("sin ninguna fuente de grounding, todos quedan «no verificados»", async () => {
    vi.mocked(generateGroundedGeminiJsonWithSources).mockResolvedValue({
      json: { competitors: [{ name: "Otterly", domain: "otterly.ai" }] },
      sources: []
    });
    const result = await suggestCompetitors(input);
    expect(result).toEqual([{ name: "Otterly", domain: "otterly.ai" }]);
  });

  it("un fallo del proveedor devuelve vacío, no competidores inventados", async () => {
    vi.mocked(generateGroundedGeminiJsonWithSources).mockRejectedValue(new Error("429"));
    expect(await suggestCompetitors(input)).toEqual([]);
  });
});
