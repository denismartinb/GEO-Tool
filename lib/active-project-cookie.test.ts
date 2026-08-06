import { describe, expect, it } from "vitest";
import { getProjectIdFromPathname } from "@/lib/active-project-cookie";

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
