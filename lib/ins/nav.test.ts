import { describe, expect, it } from "vitest";
import { crumbForPath, INS_NAV_FLAT, isNavActive, projectIdFromPath } from "./nav";

describe("menú Instrumento", () => {
  it("Visión general solo se activa en la raíz del proyecto", () => {
    const overview = INS_NAV_FLAT[0];
    expect(isNavActive("/dashboard/projects/p1", "p1", overview)).toBe(true);
    expect(isNavActive("/dashboard/projects/p1/prompts", "p1", overview)).toBe(false);
  });
  it("una subruta activa su entrada", () => {
    const prompts = INS_NAV_FLAT.find((n) => n.segment === "/prompts")!;
    expect(isNavActive("/dashboard/projects/p1/prompts", "p1", prompts)).toBe(true);
  });
  it("la miga sale de la ruta", () => {
    expect(crumbForPath("/dashboard/projects/p1/competitors")).toBe("Competidores");
    expect(crumbForPath("/dashboard/settings")).toBe("Tu perfil");
    expect(projectIdFromPath("/dashboard/projects/abc/citations")).toBe("abc");
  });
  it("no hay rayas largas en el menú", () => {
    expect(JSON.stringify(INS_NAV_FLAT)).not.toContain("—");
  });
});
