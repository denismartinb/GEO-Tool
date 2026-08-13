import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadAutomationSnapshot } from "./automation";

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
        { id: "p1", owner_user_id: "u1", recurring_scans_enabled: true, auto_web_audit_enabled: true, ...ALL_ENGINES },
        { id: "p2", owner_user_id: "u1", recurring_scans_enabled: false, auto_web_audit_enabled: true, ...ALL_ENGINES },
        { id: "p3", owner_user_id: "u1", recurring_scans_enabled: false, auto_web_audit_enabled: false, ...ALL_ENGINES }
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
        { id: "p1", owner_user_id: "u1", recurring_scans_enabled: true, auto_web_audit_enabled: false, ...ALL_ENGINES }
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
          auto_web_audit_enabled: false,
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

  it("still reports automation state when the prompt count is unreadable", async () => {
    const service = fakeService({
      projects: [
        { id: "p1", owner_user_id: "u1", recurring_scans_enabled: true, auto_web_audit_enabled: true, ...ALL_ENGINES }
      ],
      promptsError: "boom"
    });

    const snapshot = await loadAutomationSnapshot(service as never, new Map([["u1", "pro"]]));

    expect(snapshot.availability).toBe("ok");
    expect(snapshot.byProject.get("p1")?.promptCount).toBe(0);
  });
});
