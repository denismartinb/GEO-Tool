import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedContext } from "@/lib/auth";

const createCompetitorCore = vi.fn();
const dismissRecommendationCore = vi.fn();

vi.mock("@/lib/competitors/manage-competitors", () => ({
  ALREADY_TRACKED_ERROR: "Ya estás siguiendo este dominio.",
  createCompetitorCore: (...args: unknown[]) => createCompetitorCore(...args)
}));
vi.mock("@/lib/recommendations/dismiss-recommendation", () => ({
  dismissRecommendationCore: (...args: unknown[]) => dismissRecommendationCore(...args)
}));

import { addEmergingCompetitorCore } from "./add-emerging-competitor";

const USER = { id: "user-1" } as AuthenticatedContext["user"];
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const REC_ID = "33333333-3333-3333-3333-333333333333";

function supabaseWith(rec: Record<string, unknown> | null) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: rec, error: null })
  };
  return { from: () => query } as unknown as AuthenticatedContext["supabase"];
}

const emergingRec = {
  id: REC_ID,
  recommendation_type: "track_emerging_competitor",
  evidence_json: { emerging_competitor: "Semrush" }
};

function call(rec: Record<string, unknown> | null, domain = "semrush.com") {
  return addEmergingCompetitorCore({
    projectId: PROJECT_ID,
    recommendationId: REC_ID,
    domain,
    supabase: supabaseWith(rec),
    service: {} as never,
    user: USER
  });
}

describe("addEmergingCompetitorCore", () => {
  beforeEach(() => {
    createCompetitorCore.mockReset();
    dismissRecommendationCore.mockReset();
    dismissRecommendationCore.mockResolvedValue({ success: true });
  });

  it("adds the brand named in the stored evidence and marks the card done", async () => {
    createCompetitorCore.mockResolvedValue({ success: true, competitor: {}, reactivated: false });
    const result = await call(emergingRec, "https://www.semrush.com/");
    expect(result).toEqual({ success: true, name: "Semrush", alreadyTracked: false });
    expect(createCompetitorCore).toHaveBeenCalledWith(expect.objectContaining({ name: "Semrush", domain: "semrush.com" }));
    expect(dismissRecommendationCore).toHaveBeenCalledOnce();
  });

  it("treats an already-tracked domain as done, not as a failure", async () => {
    createCompetitorCore.mockResolvedValue({ success: false, error: "Ya estás siguiendo este dominio." });
    expect(await call(emergingRec)).toEqual({ success: true, name: "Semrush", alreadyTracked: true });
    expect(dismissRecommendationCore).toHaveBeenCalledOnce();
  });

  it("reports the alta's own error and leaves the card open", async () => {
    createCompetitorCore.mockResolvedValue({ success: false, error: "Esto es un asistente de IA." });
    expect(await call(emergingRec)).toEqual({ success: false, error: "Esto es un asistente de IA." });
    expect(dismissRecommendationCore).not.toHaveBeenCalled();
  });

  it("refuses an invalid domain before touching anything", async () => {
    expect((await call(emergingRec, "semrush")).success).toBe(false);
    expect(createCompetitorCore).not.toHaveBeenCalled();
  });

  it("refuses any other recommendation type, or one with no stored brand", async () => {
    expect((await call({ ...emergingRec, recommendation_type: "create_faq_section" })).success).toBe(false);
    expect((await call({ ...emergingRec, evidence_json: {} })).success).toBe(false);
    expect((await call(null)).success).toBe(false);
    expect(createCompetitorCore).not.toHaveBeenCalled();
  });

  it("still succeeds when only the mark-done write fails: the competitor is in", async () => {
    createCompetitorCore.mockResolvedValue({ success: true, competitor: {}, reactivated: false });
    dismissRecommendationCore.mockResolvedValue({ success: false, error: "x" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await call(emergingRec)).success).toBe(true);
  });
});
