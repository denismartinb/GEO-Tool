import { describe, expect, it } from "vitest";
import {
  getProjectIdFromDomainsQuery,
  getProjectIdFromPathname,
  resolveSelectedProject
} from "@/lib/active-project-cookie";

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

describe("getProjectIdFromDomainsQuery", () => {
  const uuid = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

  it("extracts a valid ?active= id on /dashboard/domains", () => {
    expect(getProjectIdFromDomainsQuery("/dashboard/domains", new URLSearchParams(`active=${uuid}`))).toBe(uuid);
  });

  it("ignores the param on any other route", () => {
    expect(getProjectIdFromDomainsQuery("/dashboard", new URLSearchParams(`active=${uuid}`))).toBeNull();
    expect(
      getProjectIdFromDomainsQuery(`/dashboard/projects/${uuid}`, new URLSearchParams(`active=${uuid}`))
    ).toBeNull();
  });

  it("ignores a missing or non-uuid value", () => {
    expect(getProjectIdFromDomainsQuery("/dashboard/domains", new URLSearchParams())).toBeNull();
    expect(getProjectIdFromDomainsQuery("/dashboard/domains", new URLSearchParams("active=not-a-uuid"))).toBeNull();
  });
});
