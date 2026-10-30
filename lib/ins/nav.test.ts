import { describe, expect, it } from "vitest";
import { crumbForPath, INS_NAV_FLAT, INS_TABS, isNavActive, projectIdFromPath, tabForPath, tabSubItems, tabTarget } from "./nav";

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

describe("barra inferior (MOBILE-TABBAR-1)", () => {
  it("cada pantalla del menú pertenece a una sola pestaña", () => {
    const all = INS_TABS.flatMap((t) => t.segments);
    expect([...all].sort()).toEqual(INS_NAV_FLAT.map((n) => n.segment).sort());
  });
  it("resuelve la pestaña de una ruta y no de los ajustes", () => {
    expect(tabForPath("/dashboard/projects/p1", "p1")?.key).toBe("home");
    expect(tabForPath("/dashboard/projects/p1/competitors", "p1")?.key).toBe("ia");
    expect(tabForPath("/dashboard/projects/p1/web-audit/x", "p1")?.key).toBe("google");
    expect(tabForPath("/dashboard/settings", "p1")).toBeNull();
  });
  it("una pestaña recuerda la última pantalla vista y si no, abre la primera", () => {
    const ia = INS_TABS.find((t) => t.key === "ia")!;
    expect(tabTarget(ia, {})).toBe("/prompts");
    expect(tabTarget(ia, { ia: "/citations" })).toBe("/citations");
    expect(tabTarget(ia, { ia: "/web-audit" })).toBe("/prompts");
  });
  it("solo las familias con varias pantallas llevan pastillas", () => {
    expect(tabSubItems(INS_TABS[0])).toEqual([]);
    expect(tabSubItems(INS_TABS.find((t) => t.key === "ia")!)).toHaveLength(3);
  });
  it("sin rayas largas", () => {
    expect(JSON.stringify(INS_TABS)).not.toContain("—");
  });
});
