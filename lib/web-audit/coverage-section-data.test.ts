import { describe, expect, it } from "vitest";
import { loadCoverageSectionData, type CoverageSectionProject } from "./coverage-section-data";
import { NOT_COVERED_NOTE } from "@/lib/web-audit/coverage-map";
import { fakeSupabase, type TableResult } from "@/lib/web-audit/test-support/fake-supabase";

/**
 * The coverage map moved from Auditoría web to Páginas citadas (SEARCH-SEO-1
 * Fase 1b, log §271). These cases came with it from `page-data.test.ts`: the
 * Pro gate read raw from the plan, a downgraded account keeping its persisted
 * coverage, and an empty project inventing nothing.
 */

const PROJECT: CoverageSectionProject = { id: "11111111-1111-1111-1111-111111111111", domain: "genscore.es" };
const RUN_ID = "22222222-2222-2222-2222-222222222222";
const LATEST_RUN = { data: { id: RUN_ID, finished_at: "2026-08-11T09:00:00.000Z", created_at: "2026-08-11T08:00:00.000Z" } };

function coverageMapJson(): string {
  const topic = (n: number, found: boolean) => ({
    promptId: `prompt-${n}`,
    topic: `Tema ${n}`,
    found,
    pages: found ? [{ url: `https://genscore.es/t${n}`, title: `Tema ${n}` }] : [],
    note: found ? "Encontrado." : NOT_COVERED_NOTE
  });

  return JSON.stringify({
    scanId: RUN_ID,
    generatedAt: "2026-08-11T09:30:00.000Z",
    topics: [topic(1, true), topic(2, true), topic(3, false)]
  });
}

/**
 * Resultados de escaneo para los tres temas del mapa. El primero lleva una cita
 * de grounding al dominio propio, así que ese tema clasifica como `performing`
 * y los otros dos no — lo justo para que cobertura y aprovechamiento sean
 * números reales en vez de nulos.
 */
function promptResults() {
  const row = (n: number, citaPropia: boolean) => ({
    id: `result-${n}`,
    prompt_id: `prompt-${n}`,
    run_id: RUN_ID,
    provider: "gemini",
    mentioned_competitors_count: 0,
    extracted_json: {
      citations: citaPropia ? [{ url: "https://genscore.es/t1", source: "grounding" }] : []
    }
  });

  return [row(1, true), row(2, false), row(3, false)];
}

/**
 * `generated_solutions` is read twice. The running-campaign read ends in
 * `maybeSingle()`, which resolves as soon as it is built, so it consumes the
 * FIRST fixture; the history read is awaited as a thenable and gets the second.
 */
function load(byTable: Record<string, TableResult | TableResult[]>) {
  const { client } = fakeSupabase(byTable);
  return loadCoverageSectionData({ supabase: client, userId: "user-1", project: PROJECT });
}

describe("la puerta Pro se lee en crudo del plan", () => {
  /**
   * `.claude/rules/web-audit.md`: se lee `profiles.current_plan` vía
   * `isProOrAbove`, nunca vía `getPlanForUser`/`resolvePlan`.
   */
  it.each([
    ["pro", true],
    ["agency", true],
    ["free", false],
    ["starter", false]
  ])("current_plan=%s → canAuditCoverage=%s", async (plan, expected) => {
    const data = await load({ profiles: { data: { current_plan: plan } } });
    expect(data.canAuditCoverage).toBe(expected);
  });

  /** Sin fila de perfil la puerta cae CERRADA: abrirla gastaría grounding que nadie paga. */
  it("sin fila de perfil no abre la cobertura", async () => {
    const data = await load({ profiles: { data: null } });
    expect(data.canAuditCoverage).toBe(false);
  });
});

describe("el mapa se cruza con lo que la IA respondió", () => {
  it("cobertura y aprovechamiento salen de filas reales", async () => {
    const data = await load({
      profiles: { data: { current_plan: "pro" } },
      scan_runs: LATEST_RUN,
      generated_solutions: [{ data: null }, { data: [{ sanitized_content: coverageMapJson() }] }],
      scan_prompt_results: { data: promptResults() }
    });

    expect(data.summary?.coveredCount).toBe(2);
    expect(Object.values(data.grouped).flat()).toHaveLength(3);
    expect(data.auditedScanDate).toBe("2026-08-11T09:00:00.000Z");
  });

  /**
   * Una cuenta que bajó de plan conserva la cobertura que dejó persistida:
   * se enseña lo medido, y la puerta cerrada sólo impide medir más.
   */
  it("una cuenta que bajó de plan sigue viendo su cobertura persistida", async () => {
    const data = await load({
      profiles: { data: { current_plan: "free" } },
      scan_runs: LATEST_RUN,
      generated_solutions: [{ data: null }, { data: [{ sanitized_content: coverageMapJson() }] }],
      scan_prompt_results: { data: promptResults() }
    });

    expect(data.canAuditCoverage).toBe(false);
    expect(data.summary).not.toBeNull();
  });
});

describe("la campaña en curso", () => {
  it("una campaña viva para el último escaneo expone su progreso y la pastilla «auditando»", async () => {
    const running = JSON.parse(coverageMapJson()) as { topics: unknown[] };
    running.topics = running.topics.slice(0, 1);
    const data = await load({
      profiles: { data: { current_plan: "pro" } },
      scan_runs: LATEST_RUN,
      generated_solutions: [
        { data: { sanitized_content: JSON.stringify(running), updated_at: new Date().toISOString() } },
        { data: [] }
      ],
      jobs: { data: { status: "running" } },
      project_prompts: { data: null, count: 3 }
    });

    expect(data.activeCampaignProgress).toEqual({ covered: 1, total: 3 });
    expect(data.auditPillState).toBe("auditing");
  });
});

describe("una sección sin datos no inventa ninguno", () => {
  it("proyecto recién creado", async () => {
    const data = await load({ profiles: { data: { current_plan: "pro" } } });

    expect(data.summary).toBeNull();
    expect(data.latestMap).toBeNull();
    expect(data.coverageDelta).toBeNull();
    expect(data.surfacingDelta).toBeNull();
    expect(data.trend).toEqual([]);
    expect(data.auditedScanDate).toBeNull();
    expect(data.activeCampaignProgress).toBeNull();
    expect(data.auditPillState).toBe("idle");
    // `grouped` existe siempre con sus seis cubos vacíos: el JSX itera sobre
    // ellos sin comprobar.
    expect(Object.values(data.grouped).every((list) => list.length === 0)).toBe(true);
  });
});
