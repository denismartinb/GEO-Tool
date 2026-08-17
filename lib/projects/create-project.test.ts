import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedContext } from "@/lib/auth";
import type { Plan } from "@/app/pricing/plans-data";
import type { NormalizedProjectInput } from "@/lib/projects/project-form";

vi.mock("@/lib/llm/gemini", () => ({
  suggestCompetitors: vi.fn(),
  suggestPrompts: vi.fn()
}));
vi.mock("@/lib/projects/business-profile", () => ({
  resolveBusinessContext: vi.fn(),
  deriveBrandAliases: vi.fn()
}));
vi.mock("@/lib/scan/scan-runner", () => ({
  createPendingScanRun: vi.fn(),
  getActionErrorCode: (error: unknown) => (error instanceof Error ? error.message : "unexpected_error")
}));

import { suggestCompetitors, suggestPrompts } from "@/lib/llm/gemini";
import { deriveBrandAliases, resolveBusinessContext } from "@/lib/projects/business-profile";
import { createPendingScanRun } from "@/lib/scan/scan-runner";
import { createProjectCore } from "./create-project";

/**
 * PRELAUNCH-HARDENING-1 Fase Q1 — los primeros tests del alta de un dominio.
 *
 * Es el Core Target Flow de `CLAUDE.md` —lo que hace un cliente nuevo en su
 * primer minuto— y llevaba ~210 líneas sin una sola aserción (riesgo #8 del
 * plan, deuda anotada en ADR 0022). No era descuido: el control de flujo eran
 * `redirect()`, que en Next **lanza**, así que no había desenlace observable.
 *
 * Lo que se fija aquí son las decisiones que un cliente nota: que no se cree
 * un proyecto duplicado, que un archivado se distinga de uno activo, que sin
 * prompts no se finja un escaneo, y que un fallo de sugerencias no impida
 * darse de alta.
 */

type SupabaseClient = AuthenticatedContext["supabase"];
type Row = Record<string, unknown>;

const USER = { id: "user-1" } as AuthenticatedContext["user"];
const PROJECT_ID = "33333333-3333-3333-3333-333333333333";

const PLAN = { id: "free", caps: { projects: 3, prompts: 10 } } as unknown as Plan;

function input(overrides: Partial<NormalizedProjectInput> = {}): NormalizedProjectInput {
  return {
    domain: "genscore.es",
    country: "ES",
    brand: "GenScore",
    name: "GenScore",
    language: "es",
    initialPrompts: [{ prompt_text: "¿mejor herramienta GEO?", category: "General", sort_order: 0 }],
    initialCompetitors: [{ name: "Otterly", domain: "otterly.ai" }],
    ...overrides
  };
}

type FakeOpts = {
  activeProjectCount?: number;
  activeProjectsError?: boolean;
  existing?: Row | null;
  existingError?: boolean;
  insertFails?: boolean;
  restoreFails?: boolean;
  promptInsertFails?: boolean;
  competitorInsertFails?: boolean;
};

function makeFakeSupabase(opts: FakeOpts = {}) {
  const inserted: Record<string, Row[]> = { projects: [], project_prompts: [], project_competitors: [] };
  const updated: { table: string; values: Row }[] = [];

  const client = {
    from(table: string) {
      return {
        select(_cols: string, options?: { count?: string; head?: boolean }) {
          if (options?.head) {
            // El conteo de proyectos activos se consume con `await` directo
            // sobre la cadena de `.eq()`, así que ésta es «thenable».
            const chain = {
              eq(_col: string, _val: unknown) {
                return chain;
              },
              then(resolve: (v: unknown) => unknown) {
                return Promise.resolve({
                  count: opts.activeProjectCount ?? 0,
                  error: opts.activeProjectsError ? { message: "boom" } : null
                }).then(resolve);
              }
            };
            return chain;
          }
          const chain = {
            eq: (_c: string, _v: unknown) => chain,
            maybeSingle: () =>
              Promise.resolve({
                data: opts.existing ?? null,
                error: opts.existingError ? { message: "boom" } : null
              }),
            single: () =>
              Promise.resolve(
                opts.insertFails
                  ? { data: null, error: { message: "insert failed" } }
                  : { data: { id: PROJECT_ID }, error: null }
              )
          };
          return chain;
        },
        /**
         * DOMAINS-ARCHIVE-RETIRE-1: reactivar un dominio archivado. Registra lo
         * actualizado en vez de tragarse la llamada, para poder afirmar que lo
         * que se escribe es `is_archived: false` y no otra cosa.
         */
        update(values: Row) {
          const chain = {
            eq(_c: string, _v: unknown) {
              return chain;
            },
            then(resolve: (v: unknown) => unknown) {
              updated.push({ table, values });
              return Promise.resolve({
                error: opts.restoreFails ? { message: "restore failed" } : null
              }).then(resolve);
            }
          };
          return chain;
        },
        insert(rows: Row | Row[]) {
          const list = Array.isArray(rows) ? rows : [rows];
          inserted[table] = [...(inserted[table] ?? []), ...list];
          const failed =
            (table === "project_prompts" && opts.promptInsertFails) ||
            (table === "project_competitors" && opts.competitorInsertFails);
          const result = { error: failed ? { message: "insert failed" } : null };
          return {
            select: () => ({
              single: () =>
                Promise.resolve(
                  opts.insertFails
                    ? { data: null, error: { message: "insert failed" } }
                    : { data: { id: PROJECT_ID }, error: null }
                )
            }),
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
          };
        }
      };
    }
  };

  return { client: client as unknown as SupabaseClient, inserted, updated };
}

function run(opts: FakeOpts = {}, values = input(), plan: Plan = PLAN) {
  const { client, inserted, updated } = makeFakeSupabase(opts);
  return {
    inserted,
    updated,
    result: createProjectCore({ input: values, plan, supabase: client, user: USER })
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(deriveBrandAliases).mockResolvedValue([]);
  vi.mocked(createPendingScanRun).mockResolvedValue(undefined as never);
  vi.mocked(resolveBusinessContext).mockResolvedValue({ status: "unidentified" } as never);
  vi.mocked(suggestCompetitors).mockResolvedValue([]);
  vi.mocked(suggestPrompts).mockResolvedValue([]);
});

describe("createProjectCore · guardas antes de crear nada", () => {
  it("respeta el tope de proyectos del plan", async () => {
    const { result } = run({ activeProjectCount: 3 });
    expect((await result).status).toBe("project_limit_reached");
  });

  it("deja pasar cuando aún queda cupo", async () => {
    const { result } = run({ activeProjectCount: 2 });
    expect((await result).status).toBe("created");
  });

  /**
   * Si el conteo falla, se deja pasar: negarle el alta a alguien por un error
   * transitorio nuestro es peor que aceptar un proyecto de más. Es la dirección
   * de fallo que ya tenía el código y se fija aquí para que no se invierta sin
   * querer.
   */
  it("un error al contar no bloquea el alta", async () => {
    const { result } = run({ activeProjectCount: 99, activeProjectsError: true });
    expect((await result).status).toBe("created");
  });

  /**
   * DOMAINS-ARCHIVE-RETIRE-1 (log §104): archivado y activo dejan de tratarse
   * igual. Un dominio ya activo sigue siendo un duplicado y se rechaza; uno
   * archivado se **reactiva**, porque desde que se retiró la pantalla de
   * archivados esta es la única forma que tiene el cliente de recuperarlo.
   */
  it("un dominio ya activo se rechaza; uno archivado se reactiva", async () => {
    const active = await run({ existing: { id: "x", is_archived: false } }).result;
    const archived = await run({ existing: { id: "x", is_archived: true } }).result;
    expect(active.status).toBe("already_active");
    expect(archived.status).toBe("restored");
    expect(archived).toMatchObject({ projectId: "x" });
  });

  it("al reactivar escribe `is_archived: false` y nada más", async () => {
    const { updated, result } = run({ existing: { id: "x", is_archived: true } });
    await result;
    // La aserción va sobre lo escrito, no sobre el status: un `update` que
    // tocara otra columna —o que escribiera en otra tabla— devolvería el mismo
    // `restored` y nadie se enteraría.
    expect(updated).toEqual([{ table: "projects", values: { is_archived: false } }]);
  });

  it("si la reactivación falla NO se dice que salió bien", async () => {
    const { result } = run({ existing: { id: "x", is_archived: true }, restoreFails: true });
    expect((await result).status).toBe("restore_failed");
  });

  /**
   * El orden importa y es el que ya estaba: el tope del plan se comprueba
   * ANTES de mirar duplicados, así que reactivar no es una puerta trasera para
   * saltárselo. Un cliente en Free con su cupo lleno no recupera un archivado
   * volviendo a añadirlo — se le dice que no cabe, igual que con uno nuevo.
   */
  it("reactivar respeta el tope del plan", async () => {
    const { result } = run({ activeProjectCount: 99, existing: { id: "x", is_archived: true } });
    expect((await result).status).toBe("project_limit_reached");
  });

  /**
   * Una consulta de duplicados que falla NO significa «no hay duplicado».
   * Tratarla como tal crearía el segundo proyecto del mismo dominio.
   */
  it("un fallo al buscar duplicados no se lee como «no hay duplicado»", async () => {
    const { result, inserted } = run({ existingError: true });
    expect((await result).status).toBe("lookup_failed");
    expect(inserted.projects).toHaveLength(0);
  });

  it("un insert fallido no deja el alta a medias ni finge éxito", async () => {
    const { result } = run({ insertFails: true });
    expect((await result).status).toBe("insert_failed");
  });
});

describe("createProjectCore · sugerencias del sistema", () => {
  it("no llama al LLM cuando el usuario ya trajo prompts y competidores", async () => {
    await run().result;
    expect(resolveBusinessContext).not.toHaveBeenCalled();
    expect(suggestCompetitors).not.toHaveBeenCalled();
    expect(suggestPrompts).not.toHaveBeenCalled();
  });

  it("pide sugerencias sólo de la mitad que falta", async () => {
    vi.mocked(resolveBusinessContext).mockResolvedValue({
      status: "identified",
      profile: { sector: "software" }
    } as never);
    vi.mocked(suggestCompetitors).mockResolvedValue([{ name: "Peec", domain: "peec.ai" }]);

    await run({}, input({ initialCompetitors: [] })).result;

    expect(suggestCompetitors).toHaveBeenCalled();
    expect(suggestPrompts).not.toHaveBeenCalled();
  });

  /**
   * Sin perfil de negocio no se sugiere nada — nunca se cae al modo ciego por
   * dominio que ADR 0020 eliminó (`.claude/rules/competitors.md`).
   */
  it("sin perfil de negocio no se sugiere nada", async () => {
    await run({}, input({ initialCompetitors: [], initialPrompts: [] })).result;
    expect(suggestCompetitors).not.toHaveBeenCalled();
    expect(suggestPrompts).not.toHaveBeenCalled();
  });

  /**
   * Un 429 en la mitad de competidores no puede impedir el alta ni llevarse por
   * delante la otra mitad — es el fallo real del 2026-08-09, una llamada caída
   * y la otra no.
   */
  it("un fallo del proveedor en una mitad no tumba el alta ni la otra mitad", async () => {
    vi.mocked(resolveBusinessContext).mockResolvedValue({
      status: "identified",
      profile: { sector: "software" }
    } as never);
    vi.mocked(suggestCompetitors).mockRejectedValue(new Error("429"));
    vi.mocked(suggestPrompts).mockResolvedValue([{ text: "¿mejor CRM?", category: "General" }] as never);

    const { result, inserted } = run({}, input({ initialCompetitors: [], initialPrompts: [] }));
    const outcome = await result;

    expect(outcome.status).toBe("created");
    expect(inserted.project_competitors).toHaveLength(0);
    expect(inserted.project_prompts).toHaveLength(1);
  });

  it("persiste el perfil de negocio sólo cuando esta rama lo calculó", async () => {
    const withProfile = run({}, input({ initialCompetitors: [] }));
    vi.mocked(resolveBusinessContext).mockResolvedValue({
      status: "identified",
      profile: { sector: "software" }
    } as never);
    await withProfile.result;

    const untouched = run();
    await untouched.result;
    expect(untouched.inserted.projects[0].business_profile).toBeNull();
  });
});

describe("createProjectCore · desenlaces tras crear el proyecto", () => {
  /**
   * Sin prompts no hay nada que escanear, así que NO se pide un run: pedirlo
   * crearía una fila condenada, y decir «escaneo iniciado» sería un escaneo
   * falso (`CLAUDE.md`).
   */
  it("sin prompts no crea escaneo y lo dice", async () => {
    const { result } = run({}, input({ initialPrompts: [], initialCompetitors: [{ name: "X", domain: "x.com" }] }));
    const outcome = await result;

    expect(outcome).toMatchObject({ status: "created", outcome: { kind: "no_prompts" } });
    expect(createPendingScanRun).not.toHaveBeenCalled();
  });

  /**
   * El proyecto ya está persistido: si el run falla, el alta NO se deshace —
   * se informa del código de error y el usuario aterriza en su proyecto.
   */
  it("un fallo al crear el escaneo no invalida el proyecto ya creado", async () => {
    vi.mocked(createPendingScanRun).mockRejectedValue(new Error("active_run_exists"));
    const outcome = await run().result;

    expect(outcome).toMatchObject({
      status: "created",
      projectId: PROJECT_ID,
      outcome: { kind: "scan_failed", errorCode: "active_run_exists" }
    });
  });

  it("marca el alta como parcial si falla un insert de prompts o competidores", async () => {
    const prompts = await run({ promptInsertFails: true }).result;
    const competitors = await run({ competitorInsertFails: true }).result;

    expect(prompts).toMatchObject({ outcome: { kind: "setup_partial" } });
    expect(competitors).toMatchObject({ outcome: { kind: "setup_partial" } });
  });

  it("el camino feliz crea proyecto, prompts, competidores y escaneo", async () => {
    const { result, inserted } = run();
    const outcome = await result;

    expect(outcome).toMatchObject({ status: "created", projectId: PROJECT_ID, outcome: { kind: "ready" } });
    expect(inserted.projects).toHaveLength(1);
    expect(inserted.project_prompts).toHaveLength(1);
    expect(inserted.project_competitors).toHaveLength(1);
    expect(createPendingScanRun).toHaveBeenCalledWith(expect.objectContaining({ projectId: PROJECT_ID }));
  });
});

describe("createProjectCore · lo que se persiste", () => {
  it("ata el proyecto a su dueño", async () => {
    const { result, inserted } = run();
    await result;
    expect(inserted.projects[0]).toMatchObject({ owner_user_id: USER.id, domain: "genscore.es" });
  });

  /**
   * GEO-SCORE-BRAND-IDENTITY-1: los alias se derivan al crear para que el
   * PRIMER escaneo ya mida bien la marca. Que fallen no puede bloquear el alta.
   */
  it("guarda los alias de marca, y un fallo al derivarlos no bloquea el alta", async () => {
    vi.mocked(deriveBrandAliases).mockResolvedValue(["Firefox"]);
    const ok = run();
    await ok.result;
    expect(ok.inserted.projects[0].brand_aliases).toEqual(["Firefox"]);

    vi.mocked(deriveBrandAliases).mockRejectedValue(new Error("boom"));
    const failed = run();
    expect((await failed.result).status).toBe("created");
    expect(failed.inserted.projects[0].brand_aliases).toEqual([]);
  });

  /**
   * Los defaults baratos de preview los decide la action (dependen de
   * `VERCEL_ENV`), y este núcleo se limita a escribir lo que le pasen — así
   * `VERCEL_ENV` no puede colarse en producción desde aquí.
   */
  it("escribe las columnas extra que le pase el llamador, y ninguna por su cuenta", async () => {
    const { client, inserted } = makeFakeSupabase();
    await createProjectCore({
      input: input(),
      plan: PLAN,
      supabase: client,
      user: USER,
      extraProjectColumns: { engine_gemini_enabled: true }
    });
    expect(inserted.projects[0]).toMatchObject({ engine_gemini_enabled: true });

    const plain = run();
    await plain.result;
    expect(plain.inserted.projects[0]).not.toHaveProperty("engine_gemini_enabled");
  });
});
