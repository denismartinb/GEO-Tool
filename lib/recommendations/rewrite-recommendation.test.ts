import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedContext } from "@/lib/auth";
import type { createServiceClient } from "@/lib/supabase/service";

const rewriteRecommendationMock = vi.fn();
const validateRewriteAgainstEvidenceMock = vi.fn();

vi.mock("@/lib/llm/gemini", () => ({
  rewriteRecommendation: (...args: unknown[]) => rewriteRecommendationMock(...args)
}));

vi.mock("@/lib/recommendations/rewrite-validation", () => ({
  validateRewriteAgainstEvidence: (...args: unknown[]) => validateRewriteAgainstEvidenceMock(...args)
}));

type SupabaseClient = AuthenticatedContext["supabase"];
type ServiceClient = ReturnType<typeof createServiceClient>;
type Row = Record<string, unknown>;
type GeneratedSolution = {
  title: string;
  summary: string;
  steps: string[];
  examples: { label: string; content: string }[];
};

/**
 * User-context fake: only the read shapes `rewriteRecommendationCore` issues —
 * an ownership-scoped single-row read on "projects", a project-scoped single-row
 * read on "recommendations", and a project-scoped list read on
 * "project_competitors". The recommendation row is never written here anymore
 * (writes go to generated_solutions via the service client).
 */
function makeFakeSupabase({
  project,
  recommendation,
  competitors,
  hangOnCompetitors = false
}: {
  project: Row | null;
  recommendation: Row | null;
  competitors: Row[];
  hangOnCompetitors?: boolean;
}) {
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
                  // never settles, to exercise the per-stage timeout instead
                  // of waiting on real I/O.
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

  return { client: client as unknown as SupabaseClient };
}

/**
 * Service-role fake: only the "generated_solutions" shapes the core issues —
 * the idempotency read (select sanitized_content … maybeSingle), the rate-limit
 * count (select id {count, head} … gte), and the insert (insert … select id …
 * maybeSingle). Records inserted payloads for assertion.
 */
function makeFakeService({
  existingSolution = null,
  rateCount = 0,
  rateError = null,
  insertError = false
}: {
  existingSolution?: GeneratedSolution | null;
  rateCount?: number;
  rateError?: { message: string } | null;
  insertError?: boolean;
} = {}) {
  const inserted: Row[] = [];

  const client = {
    from(table: string) {
      if (table !== "generated_solutions") {
        throw new Error(`Unexpected table in fake service client: ${table}`);
      }
      return {
        select(_cols: string, options?: { count?: string; head?: boolean }) {
          if (options?.head) {
            // Rate-limit count branch: .eq(...).gte(...).eq(generation_type)
            // chained in any order, then awaited. The builder is thenable so it
            // resolves regardless of how many filters are appended.
            const builder = {
              eq() {
                return builder;
              },
              gte() {
                return builder;
              },
              then(resolve: (v: { count: number | null; error: unknown }) => unknown) {
                return Promise.resolve({ count: rateCount, error: rateError }).then(resolve);
              }
            };
            return builder;
          }
          // Idempotency read branch: .eq×N.order.limit.maybeSingle().
          const builder = {
            eq() {
              return builder;
            },
            order() {
              return builder;
            },
            limit() {
              return builder;
            },
            maybeSingle() {
              return Promise.resolve({
                data: existingSolution ? { sanitized_content: JSON.stringify(existingSolution) } : null,
                error: null
              });
            }
          };
          return builder;
        },
        insert(payload: Row) {
          inserted.push(payload);
          return {
            select(_cols: string) {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: insertError ? null : { id: "gensol-1" },
                    error: insertError ? { message: "insert failed" } : null
                  });
                }
              };
            }
          };
        }
      };
    }
  };

  return { service: client as unknown as ServiceClient, getInserted: () => inserted };
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

const REWRITE: GeneratedSolution = {
  title: "Refuerza tu contenido citable frente a Conforama",
  summary: "Acme no aparece citada frente a Conforama en respuestas sobre muebles.",
  steps: [
    "Publica una comparativa directa que responda a las búsquedas afectadas.",
    "Añade un bloque factual citable en tu página de sofás cama.",
    "Incluye datos verificables sobre materiales y garantía."
  ],
  examples: [
    {
      label: "Párrafo citable para tu página",
      content: "Acme fabrica sofás cama con [tu dato aquí] de garantía y materiales certificados."
    },
    {
      label: "FAQ schema (JSON-LD)",
      content: '{\n  "@context": "https://schema.org",\n  "@type": "FAQPage"\n}'
    }
  ]
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
    const { service } = makeFakeService();

    const result = await rewriteRecommendationCore({
      projectId: "missing-project",
      recommendationId: RULE_RECOMMENDATION.id,
      supabase: client,
      service,
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
    const { service } = makeFakeService();

    const result = await rewriteRecommendationCore({
      projectId: PROJECT.id,
      recommendationId: RULE_RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result.success).toBe(false);
    expect(rewriteRecommendationMock).not.toHaveBeenCalled();
  });

  it("returns success:false when the recommendation does not exist for this project", async () => {
    const { rewriteRecommendationCore } = await import("@/lib/recommendations/rewrite-recommendation");
    const { client } = makeFakeSupabase({ project: PROJECT, recommendation: null, competitors: [] });
    const { service } = makeFakeService();

    const result = await rewriteRecommendationCore({
      projectId: PROJECT.id,
      recommendationId: "missing-rec",
      supabase: client,
      service,
      user: USER
    });

    expect(result.success).toBe(false);
    expect(rewriteRecommendationMock).not.toHaveBeenCalled();
  });

  it("is idempotent: returns the stored structured solution with no Gemini call when one already exists", async () => {
    const { rewriteRecommendationCore } = await import("@/lib/recommendations/rewrite-recommendation");
    const { client } = makeFakeSupabase({ project: PROJECT, recommendation: RULE_RECOMMENDATION, competitors: [] });
    const { service, getInserted } = makeFakeService({ existingSolution: REWRITE });

    const result = await rewriteRecommendationCore({
      projectId: PROJECT.id,
      recommendationId: RULE_RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result).toEqual({ success: true, solution: REWRITE });
    expect(rewriteRecommendationMock).not.toHaveBeenCalled();
    expect(getInserted()).toHaveLength(0);
  });

  it("returns a sanitized rate-limit message and never calls Gemini when the project is over its daily quota", async () => {
    const { rewriteRecommendationCore } = await import("@/lib/recommendations/rewrite-recommendation");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = makeFakeSupabase({ project: PROJECT, recommendation: RULE_RECOMMENDATION, competitors: [] });
    const { service, getInserted } = makeFakeService({ rateCount: 9999 });

    const result = await rewriteRecommendationCore({
      projectId: PROJECT.id,
      recommendationId: RULE_RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toContain("límite");
    expect(rewriteRecommendationMock).not.toHaveBeenCalled();
    expect(getInserted()).toHaveLength(0);

    warnSpy.mockRestore();
  });

  it("falls back to a sanitized error, inserting nothing, when Gemini throws", async () => {
    const { rewriteRecommendationCore } = await import("@/lib/recommendations/rewrite-recommendation");
    rewriteRecommendationMock.mockRejectedValue(new Error("raw provider failure with secrets"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = makeFakeSupabase({ project: PROJECT, recommendation: RULE_RECOMMENDATION, competitors: [] });
    const { service, getInserted } = makeFakeService();

    const result = await rewriteRecommendationCore({
      projectId: PROJECT.id,
      recommendationId: RULE_RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).not.toContain("raw provider failure with secrets");
    expect(getInserted()).toHaveLength(0);

    errorSpy.mockRestore();
  });

  it("falls back to a sanitized error, inserting nothing, when Gemini returns null", async () => {
    const { rewriteRecommendationCore } = await import("@/lib/recommendations/rewrite-recommendation");
    rewriteRecommendationMock.mockResolvedValue(null);
    const { client } = makeFakeSupabase({ project: PROJECT, recommendation: RULE_RECOMMENDATION, competitors: [] });
    const { service, getInserted } = makeFakeService();

    const result = await rewriteRecommendationCore({
      projectId: PROJECT.id,
      recommendationId: RULE_RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result.success).toBe(false);
    expect(getInserted()).toHaveLength(0);
    expect(validateRewriteAgainstEvidenceMock).not.toHaveBeenCalled();
  });

  it("falls back to a sanitized error, inserting nothing, when validation rejects the rewrite", async () => {
    const { rewriteRecommendationCore } = await import("@/lib/recommendations/rewrite-recommendation");
    rewriteRecommendationMock.mockResolvedValue({
      title: "Título con Ikea",
      summary: "Descripción inventada",
      steps: ["Menciona a Ikea sin permiso"],
      examples: []
    });
    validateRewriteAgainstEvidenceMock.mockReturnValue({ valid: false, reason: "untracked_competitor_mentioned" });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = makeFakeSupabase({
      project: PROJECT,
      recommendation: RULE_RECOMMENDATION,
      competitors: [{ project_id: PROJECT.id, name: "Ikea" }]
    });
    const { service, getInserted } = makeFakeService();

    const result = await rewriteRecommendationCore({
      projectId: PROJECT.id,
      recommendationId: RULE_RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result.success).toBe(false);
    expect(getInserted()).toHaveLength(0);

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
    const { service } = makeFakeService();

    vi.useFakeTimers();
    const resultPromise = rewriteRecommendationCore({
      projectId: PROJECT.id,
      recommendationId: RULE_RECOMMENDATION.id,
      supabase: client,
      service,
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

  it("returns success:false when persisting the generated solution fails", async () => {
    const { rewriteRecommendationCore } = await import("@/lib/recommendations/rewrite-recommendation");
    rewriteRecommendationMock.mockResolvedValue(REWRITE);
    validateRewriteAgainstEvidenceMock.mockReturnValue({ valid: true });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = makeFakeSupabase({ project: PROJECT, recommendation: RULE_RECOMMENDATION, competitors: [] });
    const { service } = makeFakeService({ insertError: true });

    const result = await rewriteRecommendationCore({
      projectId: PROJECT.id,
      recommendationId: RULE_RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result.success).toBe(false);

    errorSpy.mockRestore();
  });

  it("sanitizes untrusted LLM output (strips HTML/control chars) across every field before persisting", async () => {
    const { rewriteRecommendationCore } = await import("@/lib/recommendations/rewrite-recommendation");
    rewriteRecommendationMock.mockResolvedValue({
      title: "Refuerza <b>tu</b> contenido",
      summary: "Resumen con <i>énfasis</i>.",
      steps: ["Paso uno.\n\tcon salto", "Paso <script>alert(1)</script> dos"],
      examples: [
        {
          label: "Bloque <b>citable</b>",
          content: "Texto pegable con\nsalto de línea preservado."
        }
      ]
    });
    validateRewriteAgainstEvidenceMock.mockReturnValue({ valid: true });
    const { client } = makeFakeSupabase({ project: PROJECT, recommendation: RULE_RECOMMENDATION, competitors: [] });
    const { service, getInserted } = makeFakeService();

    const result = await rewriteRecommendationCore({
      projectId: PROJECT.id,
      recommendationId: RULE_RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.solution.title).toBe("Refuerza tu contenido");
    expect(result.solution.summary).not.toContain("<");
    expect(result.solution.steps.join(" ")).not.toContain("<script>");
    // No C0 control characters survive sanitization in a step (steps collapse
    // whitespace, so the injected newline/tab become a single space).
    expect(result.solution.steps.join(" ").split("").every((c) => (c.codePointAt(0) ?? 0) >= 0x20)).toBe(true);
    // The example label is strictly sanitized (tags stripped), but example
    // CONTENT preserves newlines so code/schema artifacts stay intact.
    expect(result.solution.examples[0].label).not.toContain("<");
    expect(result.solution.examples[0].content).toContain("\n");

    const payload = getInserted()[0];
    const sanitized = JSON.parse(payload.sanitized_content as string) as GeneratedSolution;
    expect(sanitized.title).toBe("Refuerza tu contenido");
    expect(sanitized.examples[0]?.label).not.toContain("<");
  });

  it("descarta el artefacto cortado en vez de persistirlo, y conserva el resto del plan", async () => {
    const { rewriteRecommendationCore } = await import("@/lib/recommendations/rewrite-recommendation");
    // El bloque real del incidente del 2026-08-20: un `FAQPage` que se queda
    // sin cerrar porque el modelo llegó a su presupuesto (log §124).
    const jsonLdCortado =
      '<script type="application/ld+json">\n{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"¿Cómo optimizo la web?","acceptedAnswer":{"@type":"Answer","text":"Utiliza HTML se';
    rewriteRecommendationMock.mockResolvedValue({
      title: "Responde las tres consultas que hoy no cubres",
      summary: "La IA responde a esas preguntas sin ti.",
      steps: ["Publica la respuesta en dos frases.", "Marca la FAQ con datos estructurados."],
      examples: [
        { label: "Párrafo citable", content: "Una respuesta directa con un dato concreto." },
        { label: "Schema FAQPage", content: jsonLdCortado }
      ]
    });
    validateRewriteAgainstEvidenceMock.mockReturnValue({ valid: true });
    const { client } = makeFakeSupabase({ project: PROJECT, recommendation: RULE_RECOMMENDATION, competitors: [] });
    const { service, getInserted } = makeFakeService();

    const result = await rewriteRecommendationCore({
      projectId: PROJECT.id,
      recommendationId: RULE_RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    // El plan sobrevive; el artefacto roto no llega ni a la respuesta ni a la fila.
    expect(result.solution.steps).toHaveLength(2);
    expect(result.solution.examples).toHaveLength(1);
    expect(result.solution.examples[0].label).toBe("Párrafo citable");

    const sanitized = JSON.parse(getInserted()[0].sanitized_content as string) as GeneratedSolution;
    expect(sanitized.examples).toHaveLength(1);
    expect(JSON.stringify(sanitized)).not.toContain("ld+json");
  });

  it("un artefacto de código válido más largo que el tope viejo (1.200) se persiste entero", async () => {
    const { rewriteRecommendationCore } = await import("@/lib/recommendations/rewrite-recommendation");
    const faqLarga = `<script type="application/ld+json">\n${JSON.stringify(
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [1, 2, 3].map((n) => ({
          "@type": "Question",
          name: `¿Pregunta ${n} sobre visibilidad en respuestas generativas?`,
          acceptedAnswer: {
            "@type": "Answer",
            text: "Una respuesta larga, del tamaño que este producto pide de verdad, con su dato concreto dentro. ".repeat(
              4
            )
          }
        }))
      },
      null,
      2
    )}\n</script>`;
    expect(faqLarga.length).toBeGreaterThan(1_200);

    rewriteRecommendationMock.mockResolvedValue({
      title: "Marca tu FAQ con datos estructurados",
      summary: "Ya respondes estas preguntas, pero la IA no puede extraerlas.",
      steps: ["Pega el bloque en la página que ya responde estas preguntas."],
      examples: [{ label: "Schema FAQPage", content: faqLarga }]
    });
    validateRewriteAgainstEvidenceMock.mockReturnValue({ valid: true });
    const { client } = makeFakeSupabase({ project: PROJECT, recommendation: RULE_RECOMMENDATION, competitors: [] });
    const { service, getInserted } = makeFakeService();

    const result = await rewriteRecommendationCore({
      projectId: PROJECT.id,
      recommendationId: RULE_RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.solution.examples[0].content).toBe(faqLarga);

    // Y lo persistido sigue parseando: es lo que el usuario va a copiar.
    const sanitized = JSON.parse(getInserted()[0].sanitized_content as string) as GeneratedSolution;
    const payload = sanitized.examples[0].content
      .replace(/^<script[^>]*>/, "")
      .replace(/<\/script>$/, "")
      .trim();
    expect(() => JSON.parse(payload)).not.toThrow();
  });

  it("happy path: calls Gemini with the recommendation's own evidence, validates every field, and inserts a sanitized structured solution", async () => {
    const { rewriteRecommendationCore } = await import("@/lib/recommendations/rewrite-recommendation");
    rewriteRecommendationMock.mockResolvedValue(REWRITE);
    validateRewriteAgainstEvidenceMock.mockReturnValue({ valid: true });
    const { client } = makeFakeSupabase({
      project: PROJECT,
      recommendation: RULE_RECOMMENDATION,
      competitors: [
        { project_id: PROJECT.id, name: "Conforama" },
        { project_id: PROJECT.id, name: "Ikea" }
      ]
    });
    const { service, getInserted } = makeFakeService();

    const result = await rewriteRecommendationCore({
      projectId: PROJECT.id,
      recommendationId: RULE_RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result).toEqual({ success: true, solution: REWRITE });

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

    // Validation runs over ALL generated text (summary + steps + every example
    // label and content), not just the title, so a fabricated mention anywhere
    // is caught.
    const validationArgs = validateRewriteAgainstEvidenceMock.mock.calls[0][0];
    expect(validationArgs.title).toBe(REWRITE.title);
    expect(validationArgs.description).toContain(REWRITE.summary);
    expect(validationArgs.description).toContain(REWRITE.steps[0]);
    expect(validationArgs.description).toContain(REWRITE.examples[0].content);
    expect(validationArgs.description).toContain(REWRITE.examples[1].label);
    expect(validationArgs).toMatchObject({
      allowedCompetitors: ["Conforama", "Conforama"],
      allowedDomains: EVIDENCE.citation_domains,
      trackedCompetitors: ["Conforama", "Ikea"],
      brandDomain: PROJECT.domain
    });

    // The solution is written to generated_solutions, sanitized and renderable,
    // anchored to the recommendation. The recommendation row is never mutated.
    const payload = getInserted()[0];
    expect(payload).toMatchObject({
      recommendation_id: RULE_RECOMMENDATION.id,
      project_id: PROJECT.id,
      rule_id: RULE_RECOMMENDATION.recommendation_type,
      generation_type: "brand_copy_suggestion",
      status: "completed",
      is_sanitized: true,
      provider: "gemini"
    });
    expect(payload.sanitized_at).toBeTruthy();
    const sanitized = JSON.parse(payload.sanitized_content as string) as GeneratedSolution;
    expect(sanitized).toEqual(REWRITE);
  });
});
