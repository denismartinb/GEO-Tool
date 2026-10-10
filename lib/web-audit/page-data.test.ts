import { beforeEach, describe, expect, it } from "vitest";
import { loadWebAuditPageData, type TechnicalSnapshotRow, type WebAuditProject } from "./page-data";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import type { PageCheckResult } from "@/lib/web-audit/page-checks";
import type { BotAccessReport } from "@/lib/web-audit/robots";
import { NOT_COVERED_NOTE } from "@/lib/web-audit/coverage-map";
import { fakeSupabase, type TableResult } from "@/lib/web-audit/test-support/fake-supabase";

/**
 * PRELAUNCH-HARDENING-1 Fase R7-b — las primeras aserciones sobre la
 * orquestación de Auditoría web.
 *
 * Eran ~330 líneas dentro del componente de página: ocho consultas, cuarenta y
 * dos valores derivados y un efecto secundario, **sin una sola aserción**. No
 * era descuido sino construcción: estaban soldadas a las ~740 líneas de JSX que
 * las pintan, así que la única forma de observar cualquiera de esas decisiones
 * era abrir un navegador — y el `ux-pilot` sólo puede ver los estados que la
 * cuenta del piloto es capaz de producir.
 *
 * Lo que se fija aquí son las decisiones que un cliente nota: qué ve según su
 * plan, cuándo NO se le miente con un delta que la muestra no sostiene, y —lo
 * más caro de equivocar— cuándo abrir la pantalla despierta al worker.
 *
 * **Qué NO cubre esto, dicho claro:** que el JSX pinte estos valores donde
 * debe. Eso es del `ux-pilot` y de los tests de render de `_components/`. Los
 * tres juntos son la cobertura de esta pantalla; ninguno solo lo es.
 */

const PROJECT: WebAuditProject = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "GenScore",
  domain: "genscore.es"
};

const RUN_ID = "22222222-2222-2222-2222-222222222222";

/**
 * Fixtures con la forma real de lo persistido — mismos moldes que
 * `_components/page-audit-row.test.tsx`. Inventar una forma más cómoda aquí
 * haría que estos tests pasaran sobre datos que la base nunca produce.
 */
function check(overrides: Partial<PageCheckResult> = {}): PageCheckResult {
  return {
    structuredData: { pass: true, matchedTypes: ["Article"] },
    answerFormat: { points: 20, hasOneH1: true, hasTwoH2: true, hasAnswerFirstIntro: true, h1Count: 1, h2Count: 3 },
    metadata: { points: 15, titleOk: true, descriptionOk: false, ogOk: true, titleLength: 40, descriptionLength: 215 },
    freshness: { status: "fresh", points: 10, date: "2026-08-01" },
    indexability: {
      points: 10,
      canonicalPresent: true,
      canonicalOk: true,
      canonicalUrl: "https://genscore.es/",
      noindex: false,
      hreflangPresent: false
    },
    citability: { points: 10, hasListOrTable: false, wordCount: 900, contentOk: true },
    pageScore: 76,
    ...overrides
  };
}

function page(overrides: Partial<PageAuditEntry> = {}): PageAuditEntry {
  return {
    url: "https://genscore.es/",
    contextLabel: "portada",
    status: "analyzed",
    check: check(),
    fetchMs: 115,
    htmlBytes: 118_681,
    ...overrides
  };
}

const BOTS: BotAccessReport = {
  robotsFound: true,
  bots: [],
  llmsTxtFound: false,
  llmsTxtBytes: null,
  sitemapFound: true
} as unknown as BotAccessReport;

/** Una fila técnica mínima y válida, con las dos páginas analizadas. */
function technicalRow(overrides: Partial<TechnicalSnapshotRow> = {}): TechnicalSnapshotRow {
  return {
    readiness_score: 76,
    pages: [page(), page({ url: "https://genscore.es/precios", contextLabel: "precios" })],
    bots: BOTS,
    created_at: "2026-08-11T10:00:00.000Z",
    ...overrides
  };
}

/**
 * Un mapa de cobertura persistido, con la forma exacta que `parseCoverageMap`
 * acepta: dos temas cubiertos y uno no, anclados al escaneo de `RUN_ID`.
 */
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

function load(byTable: Record<string, TableResult | TableResult[]>) {
  const { client } = fakeSupabase(byTable);
  return loadWebAuditPageData({ supabase: client, project: PROJECT });
}

beforeEach(() => {
  delete process.env.AUTO_WEB_AUDIT_ENABLED;
});

describe("despertar al worker es una decisión, no un efecto (WEB-AUDIT-DRIVE-1)", () => {
  /**
   * Esto es lo que este corte existía para poder afirmar. Antes el `after()`
   * vivía dentro del componente y sólo se podía comprobar abriendo la pantalla;
   * ahora la decisión se devuelve y la pantalla se limita a actuar.
   */
  const withJob = (job: Record<string, unknown> | null) => ({
    profiles: { data: { current_plan: "pro" } },
    // Dos llamadas a `scan_runs`: el último run completado (`maybeSingle`),
    // luego los 5 más recientes de cualquier estado para `activeRun` — ninguno
    // de estos tests ejercita un escaneo en curso, así que la segunda vuelve
    // vacía.
    scan_runs: [
      { data: { id: RUN_ID, finished_at: "2026-08-11T09:00:00.000Z", created_at: "2026-08-11T08:00:00.000Z" } },
      { data: [] }
    ],
    jobs: { data: job }
  });

  it("un job pendiente sin `next_attempt_at` está vencido", async () => {
    const data = await load(withJob({ status: "pending", next_attempt_at: null, locked_at: null }));
    expect(data.shouldDispatchAudit).toBe(true);
  });

  /**
   * **El caso que más importa.** El backoff de un `retrying` llega a 10 horas;
   * despachar antes de tiempo gastaría llamadas reales de Gemini en cada render
   * de la pantalla. Sin este corte no había forma de afirmarlo.
   */
  it("un job en `retrying` con el backoff aún corriendo NO se despacha", async () => {
    const enUnaHora = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const data = await load(withJob({ status: "retrying", next_attempt_at: enUnaHora, locked_at: null }));
    expect(data.shouldDispatchAudit).toBe(false);
  });

  it("un job en `retrying` con el backoff cumplido sí se despacha", async () => {
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const data = await load(withJob({ status: "retrying", next_attempt_at: haceUnaHora, locked_at: null }));
    expect(data.shouldDispatchAudit).toBe(true);
  });

  it("un job `running` con el lock fresco no se roba", async () => {
    const haceUnMinuto = new Date(Date.now() - 60 * 1000).toISOString();
    const data = await load(withJob({ status: "running", next_attempt_at: null, locked_at: haceUnMinuto }));
    expect(data.shouldDispatchAudit).toBe(false);
  });

  it("sin job no hay nada que despertar", async () => {
    const data = await load(withJob(null));
    expect(data.shouldDispatchAudit).toBe(false);
  });

  /**
   * Sin escaneo completado ni siquiera se consulta `jobs`: no hay `run_id` al
   * que anclar la auditoría.
   */
  it("sin escaneo completado no se consulta el job", async () => {
    const { client, calls } = fakeSupabase({ profiles: { data: { current_plan: "pro" } }, scan_runs: { data: null } });
    const data = await loadWebAuditPageData({ supabase: client, project: PROJECT });

    expect(data.hasCompletedScan).toBe(false);
    expect(data.shouldDispatchAudit).toBe(false);
    expect(calls).not.toContain("jobs");
  });

  /** El interruptor de entorno apaga el despacho, esté el job como esté. */
  it("con AUTO_WEB_AUDIT_ENABLED=false no se despacha nada", async () => {
    process.env.AUTO_WEB_AUDIT_ENABLED = "false";
    const data = await load(withJob({ status: "pending", next_attempt_at: null, locked_at: null }));
    expect(data.shouldDispatchAudit).toBe(false);
  });
});

describe("«auditando» se mide contra el reloj, no contra un estado", () => {
  const withJob = (status: string) => ({
    profiles: { data: { current_plan: "pro" } },
    scan_runs: [{ data: { id: RUN_ID, finished_at: null, created_at: "2026-08-11T08:00:00.000Z" } }, { data: [] }],
    jobs: { data: { status, next_attempt_at: null, locked_at: null } }
  });

  it.each(["pending", "running", "retrying"])("un job %s cuenta como auditoría en marcha", async (status) => {
    const data = await load(withJob(status));
    expect(data.auditIsRunning).toBe(true);
  });

  it.each(["completed", "failed"])("un job %s ya no", async (status) => {
    const data = await load(withJob(status));
    expect(data.auditIsRunning).toBe(false);
  });
});

describe("filas anteriores a WEB-AUDIT-R3", () => {
  /**
   * Una fila persistida antes de WEB-AUDIT-R3 no tiene `indexability` ni
   * `citability`. Leerlas sin comprobar **tumbó la pantalla entera en
   * producción el 2026-07-12**, y el aviso vivía sólo en un comentario de
   * `page-checks.ts` — que es donde una advertencia no se ejecuta. Aquí sí.
   */
  it("una fila sin los campos nuevos no rompe la carga", async () => {
    const preR3 = check();
    delete (preR3 as Partial<PageCheckResult>).indexability;
    delete (preR3 as Partial<PageCheckResult>).citability;

    const antigua = technicalRow({
      readiness_score: 51,
      pages: [page({ check: preR3 })],
      created_at: "2026-07-01T10:00:00.000Z"
    });

    const data = await load({
      profiles: { data: { current_plan: "pro" } },
      web_audit_snapshots: { data: [antigua] }
    });

    expect(data.technicalSnapshot?.readiness_score).toBe(51);
    expect(data.currentTechnicalReport).not.toBeNull();
    expect(data.analyzedPagesCount).toBe(1);
  });

  /** Sólo cuentan las páginas realmente analizadas, no las que fallaron. */
  it("una página no analizada no cuenta como analizada", async () => {
    const mixta = technicalRow({
      pages: [page(), page({ url: "https://genscore.es/404", status: "skipped_error", check: null, fetchMs: null, htmlBytes: null })]
    });

    const data = await load({
      profiles: { data: { current_plan: "pro" } },
      web_audit_snapshots: { data: [mixta] }
    });

    expect(data.analyzedPagesCount).toBe(1);
  });
});

describe("el delta técnico sólo existe con dos puntos reales", () => {
  it("con una sola auditoría no hay delta", async () => {
    const data = await load({
      profiles: { data: { current_plan: "pro" } },
      web_audit_snapshots: { data: [technicalRow()] }
    });

    expect(data.technicalScoreDelta).toBeNull();
  });

  /**
   * **El delta NO sale de la columna `readiness_score`**, sino de
   * `actualReadinessScore`, que `buildTechnicalIssuesReport` recalcula desde los
   * `pageScore` de cada página analizada. Se escribió este test variando la
   * columna, dio 0, y el código tenía razón: la columna es lo que se guardó
   * entonces, y el informe es lo que esos mismos datos valen con los criterios
   * de hoy (WEB-AUDIT-R3 reescaló los pesos, `TECHNICAL_CRITERIA_EXPANDED_AT`).
   *
   * Queda fijado aquí para que nadie «arregle» el delta haciéndolo leer la
   * columna: comparar una nota vieja calculada con criterios viejos contra una
   * nueva calculada con los actuales es justo la regresión fantasma que ese
   * aviso de la pantalla existe para explicar.
   */
  it("con dos, el delta compara notas RECALCULADAS, no las columnas guardadas", async () => {
    const data = await load({
      profiles: { data: { current_plan: "pro" } },
      web_audit_snapshots: {
        data: [
          technicalRow({
            readiness_score: 999,
            pages: [page({ check: check({ pageScore: 80 }) })],
            created_at: "2026-08-11T10:00:00.000Z"
          }),
          technicalRow({
            readiness_score: 999,
            pages: [page({ check: check({ pageScore: 60 }) })],
            created_at: "2026-08-04T10:00:00.000Z"
          })
        ]
      }
    });

    expect(data.technicalScoreDelta).toBe(20);
  });
});

describe("activeRun — el escaneo en curso, para el beat de ascenso de la primera misión", () => {
  const ACTIVE_RUN_ID = "33333333-3333-3333-3333-333333333333";

  /**
   * El caso que motiva este campo: mientras dura el primer escaneo de un
   * proyecto, `!hasCompletedScan` es cierto y sin `activeRun` la pantalla no
   * tenía forma de distinguir "nunca se ha escaneado" de "se está escaneando
   * ahora mismo" — mostraba la tarjeta vacía estática en los dos casos
   * (`FirstScanTakeover` cubre las otras cuatro secciones desde
   * ONBOARDING-ROCKET-1, pero Auditoría web se quedó fuera).
   */
  it("un run pending sin ningún escaneo completado se expone como activeRun", async () => {
    const data = await load({
      profiles: { data: { current_plan: "pro" } },
      scan_runs: [
        { data: null },
        {
          data: [
            {
              id: ACTIVE_RUN_ID,
              status: "pending",
              total_prompts: 12,
              successful_prompts: 0,
              failed_prompts: 0,
              started_at: null
            }
          ]
        }
      ]
    });

    expect(data.hasCompletedScan).toBe(false);
    expect(data.activeRun).not.toBeNull();
    expect(data.activeRun?.id).toBe(ACTIVE_RUN_ID);
    expect(data.activeRun?.status).toBe("pending");
  });

  it("sin ningún run, activeRun es null", async () => {
    const data = await load({
      profiles: { data: { current_plan: "pro" } },
      scan_runs: [{ data: null }, { data: [] }]
    });

    expect(data.activeRun).toBeNull();
  });

  /** Un run `completed`/`failed` no es un escaneo "en curso". */
  it("sólo pending/running cuentan como activeRun, no un run ya terminado", async () => {
    const data = await load({
      profiles: { data: { current_plan: "pro" } },
      scan_runs: [
        { data: null },
        {
          data: [
            { id: ACTIVE_RUN_ID, status: "failed", total_prompts: 12, successful_prompts: 0, failed_prompts: 12, started_at: null }
          ]
        }
      ]
    });

    expect(data.activeRun).toBeNull();
  });
});

describe("una pantalla sin datos no inventa ninguno", () => {
  /**
   * `CLAUDE.md`, "no fake metrics": sin escaneo, sin cobertura y sin auditoría
   * técnica, todo lo derivado sale vacío o nulo — nunca en cero, que se leería
   * como una medida real de valor cero.
   */
  it("proyecto recién creado", async () => {
    const data = await load({ profiles: { data: { current_plan: "pro" } } });

    expect(data.hasCompletedScan).toBe(false);
    expect(data.technicalSnapshot).toBeNull();
    expect(data.currentTechnicalReport).toBeNull();
    expect(data.technicalScoreDelta).toBeNull();
    expect(data.llmsTxtFile).toBeNull();
  });

  /**
   * La cobertura se fue a Páginas citadas (SEARCH-SEO-1 Fase 1b), pero el
   * llms.txt generado sigue saliendo de sus páginas verificadas: el último mapa
   * es lo único de la cobertura que esta pantalla todavía lee.
   */
  it("el llms.txt se construye con el último mapa de cobertura", async () => {
    const data = await load({
      scan_runs: [{ data: { id: RUN_ID, finished_at: null, created_at: "2026-08-11T08:00:00.000Z" } }, { data: [] }],
      generated_solutions: { data: { sanitized_content: coverageMapJson() } }
    });

    expect(data.llmsTxtFile).not.toBeNull();
  });

  /** Los pasos de publicación se derivan del dominio, no de datos de escaneo. */
  it("los pasos de llms.txt y sitemap existen desde el primer día", async () => {
    const data = await load({ profiles: { data: { current_plan: "pro" } } });

    expect(data.llmsPublishSteps.length).toBeGreaterThan(0);
    expect(data.sitemapFixSteps.length).toBeGreaterThan(0);
    expect(data.fixContext).toEqual({ projectName: "GenScore", domainNormalized: "genscore.es" });
  });
});
