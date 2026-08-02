import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedContext } from "@/lib/scan/types";
import { ProjectActionError } from "@/lib/scan/types";
import { MAX_REAL_SCAN_PROMPTS } from "@/lib/scan/constants";

const generateAddedPromptsMock = vi.fn();
const launchScanMock = vi.fn();
const resolveBusinessContextMock = vi.fn();

vi.mock("@/lib/llm/gemini", () => ({
  generateAddedPrompts: (...args: unknown[]) => generateAddedPromptsMock(...args)
}));

vi.mock("@/lib/scan/launch", () => ({
  launchScan: (...args: unknown[]) => launchScanMock(...args)
}));

vi.mock("@/lib/projects/business-profile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/projects/business-profile")>();
  return {
    ...actual,
    resolveBusinessContext: (...args: unknown[]) => resolveBusinessContextMock(...args)
  };
});

const SAMPLE_PROFILE = {
  whatItSells: "CRM para pymes",
  sector: "Software",
  subSector: "CRM B2B",
  businessModel: "b2b" as const,
  targetCustomer: "Pymes",
  geographicScope: "España",
  sizeEstimate: "Pequeña empresa",
  confidence: "high" as const
};

type SupabaseClient = AuthenticatedContext["supabase"];
type Row = Record<string, unknown>;

let nextId = 1;
function freshId() {
  return `new-prompt-${nextId++}`;
}

/**
 * Minimal in-memory fake covering exactly the query shapes `addPromptsCore`
 * issues against "projects" (single ownership-scoped read), "profiles"
 * (plan lookup), and "project_prompts" (active-prompt count/read + bulk
 * insert).
 */
function makeFakeSupabase({
  project,
  activePrompts,
  planId = "pro"
}: {
  project: Row | null;
  activePrompts: Row[];
  planId?: string;
}) {
  const insertedRows: Row[] = [];
  const projectUpdateCalls: Row[] = [];
  let forceInsertError = false;
  let forceProjectUpdateError = false;

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
          },
          update(payload: Row) {
            const filters: Array<[string, unknown]> = [];
            const builder = {
              eq(col: string, val: unknown) {
                filters.push([col, val]);
                return builder;
              },
              // update() resolves like a thenable once every .eq() is chained,
              // mirroring how addPromptsCore awaits it directly (no .select()).
              then(resolve: (value: { error: { message: string } | null }) => unknown) {
                projectUpdateCalls.push({ ...payload, __filters: filters });
                const result = forceProjectUpdateError ? { error: { message: "update failed" } } : { error: null };
                return Promise.resolve(result).then(resolve);
              }
            };
            return builder;
          }
        };
      }

      if (table === "profiles") {
        return {
          select(_cols: string) {
            const builder = {
              eq() {
                return builder;
              },
              maybeSingle() {
                return Promise.resolve({ data: { current_plan: planId }, error: null });
              }
            };
            return builder;
          }
        };
      }

      if (table === "project_prompts") {
        return {
          select(_cols: string) {
            const filters: Array<[string, unknown]> = [];
            const builder = {
              eq(col: string, val: unknown) {
                filters.push([col, val]);
                return builder;
              },
              then(resolve: (value: { data: Row[]; count: number; error: null }) => unknown) {
                const data = activePrompts.filter((row) => filters.every(([col, val]) => row[col] === val));
                return Promise.resolve({ data, count: data.length, error: null }).then(resolve);
              }
            };
            return builder;
          },
          insert(payload: Row | Row[]) {
            const rows = (Array.isArray(payload) ? payload : [payload]).map((row) => ({ id: freshId(), ...row }));
            return {
              select(_cols: string) {
                if (forceInsertError) {
                  return Promise.resolve({ data: null, error: { message: "insert failed" } });
                }
                insertedRows.push(...rows);
                return Promise.resolve({ data: rows.map((r) => ({ id: r.id })), error: null });
              }
            };
          }
        };
      }

      throw new Error(`Unexpected table in fake supabase: ${table}`);
    }
  };

  return {
    client: client as unknown as SupabaseClient,
    insertedRows,
    projectUpdateCalls,
    setForceInsertError: (value: boolean) => {
      forceInsertError = value;
    },
    setForceProjectUpdateError: (value: boolean) => {
      forceProjectUpdateError = value;
    }
  };
}

const PROJECT = {
  id: "project-1",
  brand: "Acme",
  domain: "acme.com",
  country: "ES",
  language: "es",
  is_archived: false,
  owner_user_id: "user-1",
  business_profile: null
};

const USER = { id: "user-1" } as unknown as AuthenticatedContext["user"];

describe("addPromptsCore", () => {
  beforeEach(() => {
    nextId = 1;
    generateAddedPromptsMock.mockReset();
    launchScanMock.mockReset();
    resolveBusinessContextMock.mockReset();
    // Default: no profile resolvable — matches every pre-COMPETITOR-GROUNDING-2
    // test's expectations (blind generateAddedPrompts call, no cache write).
    // Individual tests override this to exercise the identified/cached paths.
    resolveBusinessContextMock.mockResolvedValue({ status: "unidentified" });
  });

  it("auto mode: persists generated prompts and launches a scan restricted to the new ids", async () => {
    const { addPromptsCore } = await import("@/lib/projects/add-prompts");

    generateAddedPromptsMock.mockResolvedValue([
      { text: "¿Cuál es el mejor CRM para pymes?", category: "Comparación" },
      { text: "¿Qué alternativas hay a los CRM tradicionales?", category: "Alternativas" }
    ]);
    launchScanMock.mockResolvedValue({ runId: "run-1", executed: true });

    const { client, insertedRows } = makeFakeSupabase({ project: PROJECT, activePrompts: [] });

    const result = await addPromptsCore({
      projectId: PROJECT.id,
      mode: "auto",
      supabase: client,
      user: USER
    });

    expect(result).toEqual({ success: true, addedCount: 2, scanLaunched: true });
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0]).toMatchObject({
      project_id: PROJECT.id,
      prompt_text: "¿Cuál es el mejor CRM para pymes?",
      category: "Comparación",
      is_active: true
    });

    expect(launchScanMock).toHaveBeenCalledTimes(1);
    const launchArgs = launchScanMock.mock.calls[0][0];
    expect(launchArgs.onlyPromptIds).toEqual(insertedRows.map((r) => r.id));
    expect(launchArgs.projectId).toBe(PROJECT.id);
  });

  it("passes existing active prompt texts/categories through to generateAddedPrompts for dedup", async () => {
    const { addPromptsCore } = await import("@/lib/projects/add-prompts");

    generateAddedPromptsMock.mockResolvedValue([{ text: "¿Cómo elegir un CRM en 2026?", category: "Cómo hacer / guía" }]);
    launchScanMock.mockResolvedValue({ runId: "run-1", executed: true });

    const activePrompts = [
      { project_id: PROJECT.id, is_active: true, prompt_text: "¿Cuál es el mejor CRM?", category: "Comparación" },
      { project_id: PROJECT.id, is_active: true, prompt_text: "¿Qué alternativas hay?", category: "  Comparación  " }
    ];
    const { client } = makeFakeSupabase({ project: PROJECT, activePrompts });

    await addPromptsCore({ projectId: PROJECT.id, mode: "auto", supabase: client, user: USER });

    expect(generateAddedPromptsMock).toHaveBeenCalledTimes(1);
    const callArgs = generateAddedPromptsMock.mock.calls[0][0];
    expect(callArgs.existingPromptTexts).toEqual(["¿Cuál es el mejor CRM?", "¿Qué alternativas hay?"]);
    expect(callArgs.existingCategories).toEqual(["Comparación"]);
    expect(callArgs.limit).toBe(5);
  });

  it("keywords mode: forwards trimmed keywords to generateAddedPrompts", async () => {
    const { addPromptsCore } = await import("@/lib/projects/add-prompts");

    generateAddedPromptsMock.mockResolvedValue([{ text: "¿Qué CRM ofrece automatización de marketing?", category: "Casos de uso" }]);
    launchScanMock.mockResolvedValue({ runId: "run-1", executed: true });

    const { client } = makeFakeSupabase({ project: PROJECT, activePrompts: [] });

    await addPromptsCore({
      projectId: PROJECT.id,
      mode: "keywords",
      keywords: ["  automatización ", "marketing", "  "],
      supabase: client,
      user: USER
    });

    const callArgs = generateAddedPromptsMock.mock.calls[0][0];
    expect(callArgs.keywords).toEqual(["automatización", "marketing"]);
    expect(callArgs.mode).toBe("keywords");
  });

  it("keywords mode: rejects with no Gemini call when every keyword is blank", async () => {
    const { addPromptsCore } = await import("@/lib/projects/add-prompts");
    const { client } = makeFakeSupabase({ project: PROJECT, activePrompts: [] });

    const result = await addPromptsCore({
      projectId: PROJECT.id,
      mode: "keywords",
      keywords: ["  ", ""],
      supabase: client,
      user: USER
    });

    expect(result).toEqual({ success: false, error: "Introduce al menos una palabra clave." });
    expect(generateAddedPromptsMock).not.toHaveBeenCalled();
  });

  it("manual mode: preserves verbatim text/category from Gemini's categorization and scans only the new prompts", async () => {
    const { addPromptsCore } = await import("@/lib/projects/add-prompts");

    generateAddedPromptsMock.mockResolvedValue([
      { text: "¿Cuánto cuesta el plan Pro?", category: "Precio y planes" },
      { text: "¿Sirve para equipos de ventas?", category: "Casos de uso" }
    ]);
    launchScanMock.mockResolvedValue({ runId: "run-1", executed: true });

    const { client, insertedRows } = makeFakeSupabase({ project: PROJECT, activePrompts: [] });

    const result = await addPromptsCore({
      projectId: PROJECT.id,
      mode: "manual",
      manualPrompts: ["¿Cuánto cuesta el plan Pro?", "¿Sirve para equipos de ventas?"],
      supabase: client,
      user: USER
    });

    expect(result).toEqual({ success: true, addedCount: 2, scanLaunched: true });
    expect(insertedRows.map((r) => r.prompt_text)).toEqual(["¿Cuánto cuesta el plan Pro?", "¿Sirve para equipos de ventas?"]);

    const callArgs = generateAddedPromptsMock.mock.calls[0][0];
    expect(callArgs.manualPrompts).toEqual(["¿Cuánto cuesta el plan Pro?", "¿Sirve para equipos de ventas?"]);
  });

  it("manual mode: rejects with no Gemini call when there are no non-blank prompts", async () => {
    const { addPromptsCore } = await import("@/lib/projects/add-prompts");
    const { client } = makeFakeSupabase({ project: PROJECT, activePrompts: [] });

    const result = await addPromptsCore({
      projectId: PROJECT.id,
      mode: "manual",
      manualPrompts: ["   ", ""],
      supabase: client,
      user: USER
    });

    expect(result).toEqual({ success: false, error: "Introduce al menos un prompt." });
    expect(generateAddedPromptsMock).not.toHaveBeenCalled();
  });

  it("manual mode: rejects a prompt shorter than 10 characters", async () => {
    const { addPromptsCore } = await import("@/lib/projects/add-prompts");
    const { client } = makeFakeSupabase({ project: PROJECT, activePrompts: [] });

    const result = await addPromptsCore({
      projectId: PROJECT.id,
      mode: "manual",
      manualPrompts: ["short"],
      supabase: client,
      user: USER
    });

    expect(result).toEqual({ success: false, error: "Cada prompt debe tener entre 10 y 300 caracteres." });
    expect(generateAddedPromptsMock).not.toHaveBeenCalled();
  });

  it("manual mode: rejects a prompt longer than 300 characters", async () => {
    const { addPromptsCore } = await import("@/lib/projects/add-prompts");
    const { client } = makeFakeSupabase({ project: PROJECT, activePrompts: [] });

    const result = await addPromptsCore({
      projectId: PROJECT.id,
      mode: "manual",
      manualPrompts: ["x".repeat(301)],
      supabase: client,
      user: USER
    });

    expect(result).toEqual({ success: false, error: "Cada prompt debe tener entre 10 y 300 caracteres." });
    expect(generateAddedPromptsMock).not.toHaveBeenCalled();
  });

  it("manual mode: rejects more than MAX_REAL_SCAN_PROMPTS prompts at once", async () => {
    const { addPromptsCore } = await import("@/lib/projects/add-prompts");
    const { client } = makeFakeSupabase({ project: PROJECT, activePrompts: [] });

    const manualPrompts = Array.from({ length: MAX_REAL_SCAN_PROMPTS + 1 }, (_, i) => `Prompt número ${i} de prueba`);

    const result = await addPromptsCore({
      projectId: PROJECT.id,
      mode: "manual",
      manualPrompts,
      supabase: client,
      user: USER
    });

    expect(result).toEqual({
      success: false,
      error: `Puedes añadir como máximo ${MAX_REAL_SCAN_PROMPTS} prompts a la vez.`
    });
    expect(generateAddedPromptsMock).not.toHaveBeenCalled();
  });

  it("returns a sanitized fail-soft error (no insert, no scan) when generateAddedPrompts throws", async () => {
    const { addPromptsCore } = await import("@/lib/projects/add-prompts");
    generateAddedPromptsMock.mockRejectedValue(new Error("Missing GEMINI_API_KEY"));
    const { client, insertedRows } = makeFakeSupabase({ project: PROJECT, activePrompts: [] });

    const result = await addPromptsCore({
      projectId: PROJECT.id,
      mode: "manual",
      manualPrompts: ["¿Cuánto cuesta el plan Pro para diez usuarios?"],
      supabase: client,
      user: USER
    });

    // The raw provider error must never propagate as an unhandled exception
    // (which Next.js would otherwise surface as a generic "server error" page)
    // — it is caught and mapped to the existing sanitized message.
    expect(result).toEqual({ success: false, error: "No se han podido generar nuevos prompts en este momento. Inténtalo de nuevo en unos minutos." });
    expect(insertedRows).toHaveLength(0);
    expect(launchScanMock).not.toHaveBeenCalled();
  });

  it("returns a fail-soft error (no insert, no scan) when Gemini yields no candidates", async () => {
    const { addPromptsCore } = await import("@/lib/projects/add-prompts");
    generateAddedPromptsMock.mockResolvedValue([]);
    const { client, insertedRows } = makeFakeSupabase({ project: PROJECT, activePrompts: [] });

    const result = await addPromptsCore({ projectId: PROJECT.id, mode: "auto", supabase: client, user: USER });

    expect(result.success).toBe(false);
    expect(insertedRows).toHaveLength(0);
    expect(launchScanMock).not.toHaveBeenCalled();
  });

  it("returns success:false without calling Gemini when the account is already at its plan's prompt cap", async () => {
    const { addPromptsCore } = await import("@/lib/projects/add-prompts");

    // Free plan caps at 10 prompts (app/pricing/plans-data.ts) — pre-seed 10
    // active prompts for this account (RLS scopes "project_prompts" reads to
    // the owner across all their projects, so no project_id filter here).
    const activePrompts = Array.from({ length: 10 }, (_, i) => ({
      is_active: true,
      prompt_text: `Prompt existente ${i}`,
      category: "Comparación"
    }));
    const { client, insertedRows } = makeFakeSupabase({ project: PROJECT, activePrompts, planId: "free" });

    const result = await addPromptsCore({
      projectId: PROJECT.id,
      mode: "manual",
      manualPrompts: ["¿Cuánto cuesta el plan Pro para diez usuarios?"],
      supabase: client,
      user: USER
    });

    expect(result).toEqual({
      success: false,
      error: "Has alcanzado el límite de prompts monitorizados de tu plan actual. Sube de plan para añadir más."
    });
    expect(generateAddedPromptsMock).not.toHaveBeenCalled();
    expect(insertedRows).toHaveLength(0);
  });

  it("returns success:false when the project does not exist or is not owned by this user", async () => {
    const { addPromptsCore } = await import("@/lib/projects/add-prompts");
    const { client } = makeFakeSupabase({ project: null, activePrompts: [] });

    const result = await addPromptsCore({ projectId: "missing-project", mode: "auto", supabase: client, user: USER });

    expect(result.success).toBe(false);
    expect(generateAddedPromptsMock).not.toHaveBeenCalled();
  });

  it("returns success:false when the project is archived", async () => {
    const { addPromptsCore } = await import("@/lib/projects/add-prompts");
    const { client } = makeFakeSupabase({ project: { ...PROJECT, is_archived: true }, activePrompts: [] });

    const result = await addPromptsCore({ projectId: PROJECT.id, mode: "auto", supabase: client, user: USER });

    expect(result.success).toBe(false);
    expect(generateAddedPromptsMock).not.toHaveBeenCalled();
  });

  it("returns success:false when the insert fails", async () => {
    const { addPromptsCore } = await import("@/lib/projects/add-prompts");
    generateAddedPromptsMock.mockResolvedValue([{ text: "¿Cuál es el mejor CRM para pymes?", category: "Comparación" }]);
    const { client, setForceInsertError } = makeFakeSupabase({ project: PROJECT, activePrompts: [] });
    setForceInsertError(true);

    const result = await addPromptsCore({ projectId: PROJECT.id, mode: "auto", supabase: client, user: USER });

    expect(result).toEqual({ success: false, error: "No se han podido guardar los nuevos prompts." });
    expect(launchScanMock).not.toHaveBeenCalled();
  });

  it("treats a launchScan failure as a partial success: prompts are saved, scanLaunched is false, with a sanitized warning", async () => {
    const { addPromptsCore } = await import("@/lib/projects/add-prompts");
    generateAddedPromptsMock.mockResolvedValue([{ text: "¿Cuál es el mejor CRM para pymes?", category: "Comparación" }]);
    launchScanMock.mockRejectedValue(new ProjectActionError("active_run_exists"));

    const { client, insertedRows } = makeFakeSupabase({ project: PROJECT, activePrompts: [] });

    const result = await addPromptsCore({ projectId: PROJECT.id, mode: "auto", supabase: client, user: USER });

    expect(insertedRows).toHaveLength(1);
    expect(result).toEqual({
      success: true,
      addedCount: 1,
      scanLaunched: false,
      scanWarning: "Ya hay un escaneo en curso o pendiente para este dominio."
    });
  });

  describe("COMPETITOR-GROUNDING-2: business profile reuse (docs/adr/0022)", () => {
    it("uses an already-cached business_profile without calling resolveBusinessContext again", async () => {
      const { addPromptsCore } = await import("@/lib/projects/add-prompts");
      generateAddedPromptsMock.mockResolvedValue([{ text: "¿Cuál es el mejor CRM para pymes?", category: "Comparación" }]);
      launchScanMock.mockResolvedValue({ runId: "run-1", executed: true });

      const { client, projectUpdateCalls } = makeFakeSupabase({
        project: { ...PROJECT, business_profile: SAMPLE_PROFILE },
        activePrompts: []
      });

      await addPromptsCore({ projectId: PROJECT.id, mode: "auto", supabase: client, user: USER });

      expect(resolveBusinessContextMock).not.toHaveBeenCalled();
      expect(projectUpdateCalls).toHaveLength(0);
      const callArgs = generateAddedPromptsMock.mock.calls[0][0];
      expect(callArgs.profile).toEqual(SAMPLE_PROFILE);
    });

    it("lazily resolves and persists a profile when none is cached yet, and uses it for this same call", async () => {
      const { addPromptsCore } = await import("@/lib/projects/add-prompts");
      generateAddedPromptsMock.mockResolvedValue([{ text: "¿Cuál es el mejor CRM para pymes?", category: "Comparación" }]);
      launchScanMock.mockResolvedValue({ runId: "run-1", executed: true });
      resolveBusinessContextMock.mockResolvedValue({ status: "identified", profile: SAMPLE_PROFILE });

      const { client, projectUpdateCalls } = makeFakeSupabase({
        project: { ...PROJECT, business_profile: null },
        activePrompts: []
      });

      await addPromptsCore({ projectId: PROJECT.id, mode: "auto", supabase: client, user: USER });

      expect(resolveBusinessContextMock).toHaveBeenCalledWith(
        expect.objectContaining({ domain: PROJECT.domain, country: PROJECT.country, language: PROJECT.language })
      );
      expect(projectUpdateCalls).toHaveLength(1);
      expect(projectUpdateCalls[0]).toMatchObject({ business_profile: SAMPLE_PROFILE });
      const callArgs = generateAddedPromptsMock.mock.calls[0][0];
      expect(callArgs.profile).toEqual(SAMPLE_PROFILE);
    });

    it("keeps today's blind behavior (no profile, no cache write) when the business can't be identified", async () => {
      const { addPromptsCore } = await import("@/lib/projects/add-prompts");
      generateAddedPromptsMock.mockResolvedValue([{ text: "¿Cuál es el mejor CRM para pymes?", category: "Comparación" }]);
      launchScanMock.mockResolvedValue({ runId: "run-1", executed: true });
      resolveBusinessContextMock.mockResolvedValue({ status: "unidentified" });

      const { client, projectUpdateCalls } = makeFakeSupabase({
        project: { ...PROJECT, business_profile: null },
        activePrompts: []
      });

      const result = await addPromptsCore({ projectId: PROJECT.id, mode: "auto", supabase: client, user: USER });

      expect(result.success).toBe(true);
      expect(projectUpdateCalls).toHaveLength(0);
      const callArgs = generateAddedPromptsMock.mock.calls[0][0];
      expect(callArgs.profile).toBeUndefined();
    });

    it("never calls resolveBusinessContext for manual mode, regardless of a missing profile", async () => {
      const { addPromptsCore } = await import("@/lib/projects/add-prompts");
      generateAddedPromptsMock.mockResolvedValue([{ text: "¿Cuánto cuesta el plan Pro?", category: "Precio y planes" }]);
      launchScanMock.mockResolvedValue({ runId: "run-1", executed: true });

      const { client, projectUpdateCalls } = makeFakeSupabase({
        project: { ...PROJECT, business_profile: null },
        activePrompts: []
      });

      await addPromptsCore({
        projectId: PROJECT.id,
        mode: "manual",
        manualPrompts: ["¿Cuánto cuesta el plan Pro?"],
        supabase: client,
        user: USER
      });

      expect(resolveBusinessContextMock).not.toHaveBeenCalled();
      expect(projectUpdateCalls).toHaveLength(0);
      const callArgs = generateAddedPromptsMock.mock.calls[0][0];
      expect(callArgs.profile).toBeUndefined();
    });

    it("still succeeds (using the freshly-resolved profile) even if the best-effort cache write fails", async () => {
      const { addPromptsCore } = await import("@/lib/projects/add-prompts");
      generateAddedPromptsMock.mockResolvedValue([{ text: "¿Cuál es el mejor CRM para pymes?", category: "Comparación" }]);
      launchScanMock.mockResolvedValue({ runId: "run-1", executed: true });
      resolveBusinessContextMock.mockResolvedValue({ status: "identified", profile: SAMPLE_PROFILE });

      const { client, setForceProjectUpdateError } = makeFakeSupabase({
        project: { ...PROJECT, business_profile: null },
        activePrompts: []
      });
      setForceProjectUpdateError(true);

      const result = await addPromptsCore({ projectId: PROJECT.id, mode: "auto", supabase: client, user: USER });

      expect(result.success).toBe(true);
      const callArgs = generateAddedPromptsMock.mock.calls[0][0];
      expect(callArgs.profile).toEqual(SAMPLE_PROFILE);
    });
  });
});
