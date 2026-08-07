import { describe, expect, it } from "vitest";
import { getProjectIdFromPathname, resolveSelectedProject } from "@/lib/active-project-cookie";

describe("resolveSelectedProject", () => {
  const projects = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("prefers the explicit request over the remembered cookie", () => {
    expect(resolveSelectedProject(projects, "b", "c")).toEqual({ id: "b" });
  });

  it("falls back to the remembered project when there is no explicit request", () => {
    expect(resolveSelectedProject(projects, null, "c")).toEqual({ id: "c" });
  });

  it("falls back to the first project when neither matches a known project", () => {
    expect(resolveSelectedProject(projects, "missing", null)).toEqual({ id: "a" });
    expect(resolveSelectedProject(projects, null, "missing")).toEqual({ id: "a" });
    expect(resolveSelectedProject(projects, undefined, undefined)).toEqual({ id: "a" });
  });

  it("returns undefined for an empty project list", () => {
    expect(resolveSelectedProject([], "a", "b")).toBeUndefined();
  });
});

describe("getProjectIdFromPathname", () => {
  const uuid = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

  it("extracts the project id from a project route", () => {
    expect(getProjectIdFromPathname(`/dashboard/projects/${uuid}`)).toBe(uuid);
    expect(getProjectIdFromPathname(`/dashboard/projects/${uuid}/prompts`)).toBe(uuid);
    expect(getProjectIdFromPathname(`/dashboard/projects/${uuid}/debug`)).toBe(uuid);
  });

  it("ignores the project-creation route, which is not a project id", () => {
    expect(getProjectIdFromPathname("/dashboard/projects/new")).toBeNull();
  });

  it("ignores routes outside a project", () => {
    expect(getProjectIdFromPathname("/dashboard/domains")).toBeNull();
    expect(getProjectIdFromPathname("/dashboard/settings/profile")).toBeNull();
    expect(getProjectIdFromPathname("/debug")).toBeNull();
  });
});
