import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadAutomationSnapshot } from "./automation";

/**
 * Guarda estática, y no es teórica: la primera implementación de esta fase leía
 * `auto_web_audit_enabled`, la columna que la migración 0031 retiró
 * explícitamente ("do not reintroduce reads of it"). Su default sigue siendo
 * `true` y ya nadie la escribe, así que /admin habría pintado "auditoría
 * activada, con coste" en casi todas las cuentas cuando la realidad es que
 * está apagada en casi todas — una métrica inventada, justo lo que el módulo
 * dice impedir. Lo cazó la QA antes de mergear; esto impide que vuelva.
 */
describe("columnas de auditoría leídas", () => {
  const source = readFileSync(join(process.cwd(), "lib/admin/automation.ts"), "utf8");

  it("no vuelve a leer la columna retirada por la migración 0031", () => {
    const selectLine = source.split("\n").find((line) => line.includes("recurring_scans_enabled"));
    expect(selectLine).toBeDefined();
    expect(selectLine).not.toContain("auto_web_audit_enabled");
  });

  it("lee las dos mitades que sí están vivas", () => {
    expect(source).toContain("auto_technical_audit_enabled");
    expect(source).toContain("auto_coverage_audit_enabled");
  });
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

type Row = Record<string, unknown>;

function fakeService(options: {
  projects?: Row[];
  projectsError?: string;
  projectsThrows?: boolean;
  prompts?: Row[];
  promptsError?: string;
}) {
  return {
    from(table: string) {
      if (table === "projects") {
        return {
          select: () => ({
            eq: () => {
              if (options.projectsThrows) throw new Error("boom");
              return Promise.resolve(
                options.projectsError
                  ? { data: null, error: { message: options.projectsError } }
                  : { data: options.projects ?? [], error: null }
              );
            }
          })
        };
      }
      if (table === "project_prompts") {
        return {
          select: () => ({
            in: () => ({
              eq: () =>
                Promise.resolve(
                  options.promptsError
                    ? { data: null, error: { message: options.promptsError } }
                    : { data: options.prompts ?? [], error: null }
                )
            })
          })
        };
      }
      throw new Error(`unexpected table ${table}`);
    }
  };
}

const ALL_ENGINES = {
  engine_gemini_enabled: true,
  engine_claude_enabled: true,
  engine_openai_enabled: true
};

describe("loadAutomationSnapshot", () => {
  it("aggregates active/total per owner across their projects", async () => {
    const service = fakeService({
      projects: [
        { id: "p1", owner_user_id: "u1", recurring_scans_enabled: true, auto_technical_audit_enabled: true, auto_coverage_audit_enabled: true, ...ALL_ENGINES },
        { id: "p2", owner_user_id: "u1", recurring_scans_enabled: false, auto_technical_audit_enabled: true, auto_coverage_audit_enabled: true, ...ALL_ENGINES },
        { id: "p3", owner_user_id: "u1", recurring_scans_enabled: false, auto_technical_audit_enabled: false, auto_coverage_audit_enabled: false, ...ALL_ENGINES }
      ],
      prompts: [{ project_id: "p1" }, { project_id: "p1" }, { project_id: "p2" }]
    });

    const snapshot = await loadAutomationSnapshot(service as never, new Map([["u1", "pro"]]));
    const account = snapshot.byOwner.get("u1");

    expect(snapshot.availability).toBe("ok");
    expect(account).toMatchObject({ recurringActive: 1, auditActive: 2, totalProjects: 3, recurringInertOnFree: 0 });
  });

  it("counts a Free owner's enabled recurring scan as inert, not active", async () => {
    const service = fakeService({
      projects: [
        { id: "p1", owner_user_id: "u1", recurring_scans_enabled: true, auto_technical_audit_enabled: false, auto_coverage_audit_enabled: false, ...ALL_ENGINES }
      ],
      prompts: [{ project_id: "p1" }]
    });

    const snapshot = await loadAutomationSnapshot(service as never, new Map([["u1", "free"]]));
    const account = snapshot.byOwner.get("u1");

    expect(account).toMatchObject({ recurringActive: 0, recurringInertOnFree: 1 });
    expect(snapshot.byProject.get("p1")).toMatchObject({
      recurringScansEnabled: true,
      recurringScansEffective: false
    });
    // Un proyecto inerte no puede sumar coste: el barrido nunca lo escanea.
    expect(account?.monthlyUsd).toBe(0);
  });

  it("degrades to 'unmigrated' instead of guessing when the columns can't be read", async () => {
    const service = fakeService({ projectsError: "column projects.auto_web_audit_enabled does not exist" });

    const snapshot = await loadAutomationSnapshot(service as never, new Map([["u1", "pro"]]));

    expect(snapshot.availability).toBe("unmigrated");
    expect(snapshot.byOwner.size).toBe(0);
    expect(snapshot.byProject.size).toBe(0);
  });

  it("never throws when the query itself throws — /admin must still render", async () => {
    const service = fakeService({ projectsThrows: true });

    const snapshot = await loadAutomationSnapshot(service as never, new Map());

    expect(snapshot.availability).toBe("unmigrated");
  });

  it("treats a null engine flag as enabled, matching run-creation's shipped fail direction", async () => {
    const service = fakeService({
      projects: [
        {
          id: "p1",
          owner_user_id: "u1",
          recurring_scans_enabled: false,
          auto_technical_audit_enabled: false, auto_coverage_audit_enabled: false,
          engine_gemini_enabled: null,
          engine_claude_enabled: null,
          engine_openai_enabled: false
        }
      ],
      prompts: [{ project_id: "p1" }]
    });

    const snapshot = await loadAutomationSnapshot(service as never, new Map([["u1", "pro"]]));

    expect(snapshot.byProject.get("p1")?.engines).toEqual(["gemini", "claude"]);
  });

  it("counts the two audit halves separately — only coverage spends LLM", async () => {
    const service = fakeService({
      projects: [
        { id: "p1", owner_user_id: "u1", recurring_scans_enabled: false, auto_technical_audit_enabled: true, auto_coverage_audit_enabled: false, ...ALL_ENGINES }
      ],
      prompts: [{ project_id: "p1" }]
    });

    const snapshot = await loadAutomationSnapshot(service as never, new Map([["u1", "pro"]]));

    // La técnica activada no cuenta como "auditoría con coste".
    expect(snapshot.byOwner.get("u1")).toMatchObject({ auditActive: 0, technicalAuditActive: 1 });
    expect(snapshot.byProject.get("p1")).toMatchObject({
      technicalAuditEnabled: true,
      coverageAuditEnabled: false
    });
  });

  it("degrades the account provenance to 'no_medido' when any project includes coverage cost", async () => {
    const service = fakeService({
      projects: [
        { id: "p1", owner_user_id: "u1", recurring_scans_enabled: true, auto_technical_audit_enabled: false, auto_coverage_audit_enabled: false, ...ALL_ENGINES },
        { id: "p2", owner_user_id: "u1", recurring_scans_enabled: true, auto_technical_audit_enabled: false, auto_coverage_audit_enabled: true, ...ALL_ENGINES }
      ],
      prompts: [{ project_id: "p1" }, { project_id: "p2" }]
    });

    const snapshot = await loadAutomationSnapshot(service as never, new Map([["u1", "pro"]]));

    // Un total no puede presentarse como más fiable que su peor sumando.
    expect(snapshot.byOwner.get("u1")?.provenance).toBe("no_medido");
  });

  it("keeps the account provenance at 'estimado' when no coverage audit is involved", async () => {
    const service = fakeService({
      projects: [
        { id: "p1", owner_user_id: "u1", recurring_scans_enabled: true, auto_technical_audit_enabled: true, auto_coverage_audit_enabled: false, ...ALL_ENGINES }
      ],
      prompts: [{ project_id: "p1" }]
    });

    const snapshot = await loadAutomationSnapshot(service as never, new Map([["u1", "pro"]]));

    expect(snapshot.byOwner.get("u1")?.provenance).toBe("estimado");
  });

  it("still reports automation state when the prompt count is unreadable", async () => {
    const service = fakeService({
      projects: [
        { id: "p1", owner_user_id: "u1", recurring_scans_enabled: true, auto_technical_audit_enabled: true, auto_coverage_audit_enabled: true, ...ALL_ENGINES }
      ],
      promptsError: "boom"
    });

    const snapshot = await loadAutomationSnapshot(service as never, new Map([["u1", "pro"]]));

    expect(snapshot.availability).toBe("ok");
    expect(snapshot.byProject.get("p1")?.promptCount).toBe(0);
  });
});
