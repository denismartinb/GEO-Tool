import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedContext } from "@/lib/scan/types";

const rewriteRecommendationMock = vi.fn();
const validateRewriteAgainstEvidenceMock = vi.fn();

vi.mock("@/lib/llm/gemini", () => ({
  rewriteRecommendation: (...args: unknown[]) => rewriteRecommendationMock(...args)
}));

vi.mock("@/lib/recommendations/rewrite-validation", () => ({
  validateRewriteAgainstEvidence: (...args: unknown[]) => validateRewriteAgainstEvidenceMock(...args)
}));

type SupabaseClient = AuthenticatedContext["supabase"];
type Row = Record<string, unknown>;

/**
 * Minimal in-memory fake covering exactly the query shapes
 * `rewriteRecommendationCore` issues: an ownership-scoped single-row read on
 * "projects", a project-scoped single-row read + update on "recommendations",
 * and a project-scoped list read on "project_competitors".
 */
function makeFakeSupabase({
  project,
  recommendation,
  competitors,
  forceUpdateError = false,
  hangOnCompetitors = false
}: {
  project: Row | null;
  recommendation: Row | null;
  competitors: Row[];
  forceUpdateError?: boolean;
  hangOnCompetitors?: boolean;
}) {
  let updatedRow: Row | null = null;
  let updateCalled = false;

  const client = {
    from(table: string) {
      if (table === "projects") {
        return {
          select(_cols: string) {
            const filters: Array<[string, unknown]> = [];
            const builder = {
              eq(col: string, val: unknown) {
                filters.push([col, val]);
                return builder;
              },
              maybeSingle() {
                const match = project && filters.every(([col, val]) => project[col] === val) ? project : null;
                return Promise.resolve({ data: match, error: null });
              }
            };
            return builder;
          }
        };
      }

      if (table === "recommendations") {
        return {
          select(_cols: string) {
            const filters: Array<[string, unknown]> = [];
            const builder = {
              eq(col: string, val: unknown) {
                filters.push([col, val]);
                return builder;
              },
              maybeSingle() {
                const match =
                  recommendation && filters.every(([col, val]) => recommendation[col] === val) ? recommendation : null;
                return Promise.resolve({ data: match, error: null });
              }
            };
            return builder;
          },
          update(payload: Row) {
            const filters: Array<[string, unknown]> = [];
            const builder = {
              eq(col: string, val: unknown) {
                filters.push([col, val]);
                return builder;
              },
              then(resolve: (value: { error: { message: string } | null }) => unknown) {
                updateCalled = true;
                if (forceUpdateError) {
                  return Promise.resolve({ error: { message: "update failed" } }).then(resolve);
                }
                updatedRow = { ...recommendation, ...payload };
                return Promise.resolve({ error: null }).then(resolve);
              }
            };
            return builder;
          }
        };
      }

      if (table === "project_competitors") {
        return {
          select(_cols: string) {
            const filters: Array<[string, unknown]> = [];
            const builder = {
              eq(col: string, val: unknown) {
                filters.push([col, val]);
                if (hangOnCompetitors) {
                  // Simulates a stalled Postgres connection: a promise that
                  // never settles, to exercise rewriteRecommendationCore's
                  // per-stage timeout instead of waiting on real I/O.
                  return new Promise(() => {});
                }
                return Promise.resolve({
                  data: competitors.filter((row) => filters.every(([c, v]) => row[c] === v) && row[col] === val),
                  error: null
                });
              }
            };
            return builder;
          }
        };
      }

      throw new Error(`Unexpected table in fake supabase: ${table}`);
    }
  };

  return {
    client: client as unknown as SupabaseClient,
    getUpdatedRow: () => updatedRow,
    wasUpdateCalled: () => updateCalled
  };
}

const PROJECT = {
  id: "project-1",
  brand: "Acme",
  domain: "acme.com",
  language: "es",
  is_archived: false,
  owner_user_id: "user-1"
};

const EVIDENCE = {
  why_this_matters: "Una presencia de citas baja limita tu autoridad.",
  affected_prompts: ["¿Cuál es la mejor marca de muebles?"],
  mentioned_competitors: ["Conforama"],
  citation_domains: ["example.com"],
  evidence_snippets: ["Acme no aparece citada en esta respuesta."],
  dominant_competitor: "Conforama"
};

const RULE_RECOMMENDATION = {
  id: "rec-1",
  project_id: "project-1",
  title: "Haz que tu contenido sea más citable",
  description: "Las respuestas de IA rara vez citan tu marca.",
  recommendation_type: "improve_citation_readiness",
  source_type: "rule",
  evidence_json: EVIDENCE
};

const USER = { id: "user-1" } as unknown as AuthenticatedContext["user"];

describe("rewriteRecommendationCore", () => {
  beforeEach(() => {
    rewriteRecommendationMock.mockReset();
    validateRewriteAgainstEvidenceMock.mockReset();
  });

  it("returns success:false when the project does not exist or is not owned by this user", async () => {
    const { rewriteRecommendationCore } = await import("@/lib/recommendations/rewrite-recommendation");
    const { client } = makeFakeSupabase({ project: null, recommendation: RULE_RECOMMENDATION, competitors: [] });

    const result = await rewriteRecommendationCore({
      projectId: "missing-project",
      recommendationId: RULE_RECOMMENDATION.id,
      supabase: client,
      user: USER
    });

    expect(result.success).toBe(false);
    expect(rewriteRecommendationMock).not.toHaveBeenCalled();
  });

  it("returns success:false when the project is archived", async () => {
    const { rewriteRecommendationCore } = await import("@/lib/recommendations/rewrite-recommendation");
    const { client } = makeFakeSupabase({
      project: { ...PROJECT, is_archived: true },
      recommendation: RULE_RECOMMENDATION,
      competitors: []
    });

    const result = await rewriteRecommendationCore({
      projectId: PROJECT.id,
      recommendationId: RULE_RECOMMENDATION.id,
      supabase: client,
      user: USER
    });

    expect(result.success).toBe(false);
    expect(rewriteRecommendationMock).not.toHaveBeenCalled();
  });

  it("returns success:false when the recommendation does not exist for this project", async () => {
    const { rewriteRecommendationCore } = await import("@/lib/recommendations/rewrite-recommendation");
    const { client } = makeFakeSupabase({ project: PROJECT, recommendation: null, competitors: [] });

    const result = await rewriteRecommendationCore({
      projectId: PROJECT.id,
      recommendationId: "missing-rec",
      supabase: client,
      user: USER
    });

    expect(result.success).toBe(false);
    expect(rewriteRecommendationMock).not.toHaveBeenCalled();
  });

  it("is idempotent: returns the stored solution with no Gemini call when already llm_rewrite", async () => {
    const { rewriteRecommendationCore } = await import("@/lib/recommendations/rewrite-recommendation");
    const alreadyRewritten = {
      ...RULE_RECOMMENDATION,
      source_type: "llm_rewrite",
      evidence_json: {
        ...EVIDENCE,
        solution_title: "Refuerza tu contenido citable frente a Conforama",
        solution_description: "Publica comparativas que respondan directamente a estas búsquedas."
      }
    };
    const { client } = makeFakeSupabase({ project: PROJECT, recommendation: alreadyRewritten, competitors: [] });

    const result = await rewriteRecommendationCore({
      projectId: PROJECT.id,
      recommendationId: RULE_RECOMMENDATION.id,
      supabase: client,
      user: USER
    });

    expect(result).toEqual({
      success: true,
      solutionTitle: alreadyRewritten.evidence_json.solution_title,
      solutionDescription: alreadyRewritten.evidence_json.solution_description
    });
    expect(rewriteRecommendationMock).not.toHaveBeenCalled();
  });

  it("is idempotent and falls back to the row's own title/description for a legacy llm_rewrite row with no stored solution fields", async () => {
    const { rewriteRecommendationCore } = await import("@/lib/recommendations/rewrite-recommendation");
    const alreadyRewritten = { ...RULE_RECOMMENDATION, source_type: "llm_rewrite" };
    const { client } = makeFakeSupabase({ project: PROJECT, recommendation: alreadyRewritten, competitors: [] });

    const result = await rewriteRecommendationCore({
      projectId: PROJECT.id,
      recommendationId: RULE_RECOMMENDATION.id,
      supabase: client,
      user: USER
    });

    expect(result).toEqual({
      success: true,
      solutionTitle: alreadyRewritten.title,
      solutionDescription: alreadyRewritten.description
    });
    expect(rewriteRecommendationMock).not.toHaveBeenCalled();
  });

  it("falls back to a sanitized error, leaving the row untouched, when Gemini throws", async () => {
    const { rewriteRecommendationCore } = await import("@/lib/recommendations/rewrite-recommendation");
    rewriteRecommendationMock.mockRejectedValue(new Error("raw provider failure with secrets"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, wasUpdateCalled } = makeFakeSupabase({
      project: PROJECT,
      recommendation: RULE_RECOMMENDATION,
      competitors: []
    });

    const result = await rewriteRecommendationCore({
      projectId: PROJECT.id,
      recommendationId: RULE_RECOMMENDATION.id,
      supabase: client,
      user: USER
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).not.toContain("raw provider failure with secrets");
    expect(wasUpdateCalled()).toBe(false);

    errorSpy.mockRestore();
  });

  it("falls back to a sanitized error, leaving the row untouched, when Gemini returns null", async () => {
    const { rewriteRecommendationCore } = await import("@/lib/recommendations/rewrite-recommendation");
    rewriteRecommendationMock.mockResolvedValue(null);
    const { client, wasUpdateCalled } = makeFakeSupabase({
      project: PROJECT,
      recommendation: RULE_RECOMMENDATION,
      competitors: []
    });

    const result = await rewriteRecommendationCore({
      projectId: PROJECT.id,
      recommendationId: RULE_RECOMMENDATION.id,
      supabase: client,
      user: USER
    });

    expect(result.success).toBe(false);
    expect(wasUpdateCalled()).toBe(false);
    expect(validateRewriteAgainstEvidenceMock).not.toHaveBeenCalled();
  });

  it("falls back to a sanitized error, leaving the row untouched, when validation rejects the rewrite", async () => {
    const { rewriteRecommendationCore } = await import("@/lib/recommendations/rewrite-recommendation");
    rewriteRecommendationMock.mockResolvedValue({ title: "Título con Ikea", description: "Descripción inventada" });
    validateRewriteAgainstEvidenceMock.mockReturnValue({ valid: false, reason: "untracked_competitor_mentioned" });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client, wasUpdateCalled } = makeFakeSupabase({
      project: PROJECT,
      recommendation: RULE_RECOMMENDATION,
      competitors: [{ project_id: PROJECT.id, name: "Ikea" }]
    });

    const result = await rewriteRecommendationCore({
      projectId: PROJECT.id,
      recommendationId: RULE_RECOMMENDATION.id,
      supabase: client,
      user: USER
    });

    expect(result.success).toBe(false);
    expect(wasUpdateCalled()).toBe(false);

    warnSpy.mockRestore();
  });

  it("bounds a stalled Supabase read with a sanitized timeout instead of hanging forever", async () => {
    const { rewriteRecommendationCore } = await import("@/lib/recommendations/rewrite-recommendation");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = makeFakeSupabase({
      project: PROJECT,
      recommendation: RULE_RECOMMENDATION,
      competitors: [],
      hangOnCompetitors: true
    });

    vi.useFakeTimers();
    const resultPromise = rewriteRecommendationCore({
      projectId: PROJECT.id,
      recommendationId: RULE_RECOMMENDATION.id,
      supabase: client,
      user: USER
    });

    await vi.advanceTimersByTimeAsync(8_000);
    const result = await resultPromise;
    vi.useRealTimers();

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).not.toContain("project_competitors");
    expect(rewriteRecommendationMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("stage_timed_out"),
      expect.objectContaining({ stage: "load_competitors" })
    );

    errorSpy.mockRestore();
  });

  it("returns success:false when persisting the validated rewrite fails", async () => {
    const { rewriteRecommendationCore } = await import("@/lib/recommendations/rewrite-recommendation");
    rewriteRecommendationMock.mockResolvedValue({
      title: "Refuerza tu contenido citable frente a Conforama",
      description: "Acme no aparece citada frente a Conforama en respuestas sobre muebles."
    });
    validateRewriteAgainstEvidenceMock.mockReturnValue({ valid: true });
    const { client } = makeFakeSupabase({
      project: PROJECT,
      recommendation: RULE_RECOMMENDATION,
      competitors: [],
      forceUpdateError: true
    });

    const result = await rewriteRecommendationCore({
      projectId: PROJECT.id,
      recommendationId: RULE_RECOMMENDATION.id,
      supabase: client,
      user: USER
    });

    expect(result.success).toBe(false);
  });

  it("happy path: calls Gemini with the recommendation's own evidence, validates, and persists the rewrite", async () => {
    const { rewriteRecommendationCore } = await import("@/lib/recommendations/rewrite-recommendation");
    const rewrite = {
      title: "Refuerza tu contenido citable frente a Conforama",
      description: "Acme no aparece citada frente a Conforama en respuestas sobre muebles."
    };
    rewriteRecommendationMock.mockResolvedValue(rewrite);
    validateRewriteAgainstEvidenceMock.mockReturnValue({ valid: true });
    const { client, getUpdatedRow } = makeFakeSupabase({
      project: PROJECT,
      recommendation: RULE_RECOMMENDATION,
      competitors: [
        { project_id: PROJECT.id, name: "Conforama" },
        { project_id: PROJECT.id, name: "Ikea" }
      ]
    });

    const result = await rewriteRecommendationCore({
      projectId: PROJECT.id,
      recommendationId: RULE_RECOMMENDATION.id,
      supabase: client,
      user: USER
    });

    expect(result).toEqual({ success: true, solutionTitle: rewrite.title, solutionDescription: rewrite.description });

    const geminiArgs = rewriteRecommendationMock.mock.calls[0][0];
    expect(geminiArgs).toMatchObject({
      brand: PROJECT.brand,
      domain: PROJECT.domain,
      language: PROJECT.language,
      recommendationType: RULE_RECOMMENDATION.recommendation_type,
      ruleTitle: RULE_RECOMMENDATION.title,
      ruleDescription: RULE_RECOMMENDATION.description,
      whyThisMatters: EVIDENCE.why_this_matters,
      affectedPrompts: EVIDENCE.affected_prompts,
      mentionedCompetitors: EVIDENCE.mentioned_competitors,
      citationDomains: EVIDENCE.citation_domains,
      dominantCompetitor: EVIDENCE.dominant_competitor,
      evidenceSnippets: EVIDENCE.evidence_snippets
    });

    const validationArgs = validateRewriteAgainstEvidenceMock.mock.calls[0][0];
    expect(validationArgs).toMatchObject({
      title: rewrite.title,
      description: rewrite.description,
      allowedCompetitors: ["Conforama", "Conforama"],
      allowedDomains: EVIDENCE.citation_domains,
      trackedCompetitors: ["Conforama", "Ikea"],
      brandDomain: PROJECT.domain
    });

    const updated = getUpdatedRow();
    expect(updated).toMatchObject({ source_type: "llm_rewrite" });
    // The rule-based title/description are the problem statement and must
    // never be overwritten — the generated solution lives in evidence_json.
    expect(updated?.title).toBe(RULE_RECOMMENDATION.title);
    expect(updated?.description).toBe(RULE_RECOMMENDATION.description);
    expect((updated?.evidence_json as Record<string, unknown>).solution_title).toBe(rewrite.title);
    expect((updated?.evidence_json as Record<string, unknown>).solution_description).toBe(rewrite.description);
  });
});
