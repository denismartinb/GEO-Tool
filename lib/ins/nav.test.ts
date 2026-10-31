import { describe, expect, it } from "vitest";
import { crumbForPath, INS_NAV, INS_NAV_FLAT, INS_TABS, isNavActive, navHref, projectIdFromPath, switchProjectHref, tabForPath, tabSubItems, tabTarget } from "./nav";

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
  it("la auditoría técnica son dos entradas, una por canal, en la misma ruta", () => {
    const geo = INS_NAV_FLAT.find((n) => n.block === "geo")!;
    const seo = INS_NAV_FLAT.find((n) => n.block === "seo")!;
    expect(INS_NAV.find((g) => g.label === "En la IA")!.items).toContain(geo);
    expect(INS_NAV.find((g) => g.label === "En Google")!.items).toContain(seo);
    expect(navHref("p1", seo)).toBe("/dashboard/projects/p1/web-audit?bloque=seo");
    const path = "/dashboard/projects/p1/web-audit";
    expect(isNavActive(path, "p1", geo)).toBe(true);
    expect(isNavActive(path, "p1", seo)).toBe(false);
    expect(isNavActive(path, "p1", seo, "seo")).toBe(true);
    expect(isNavActive(path, "p1", geo, "seo")).toBe(false);
    expect(crumbForPath(path, "seo")).toBe("Tu web para Google");
    expect(crumbForPath(path)).toBe("Tu web para la IA");
  });
  it("no hay rayas largas en el menú", () => {
    expect(JSON.stringify(INS_NAV_FLAT)).not.toContain("—");
  });
});

describe("barra inferior (MOBILE-TABBAR-1)", () => {
  it("cada pantalla del menú pertenece a una sola pestaña", () => {
    const all = INS_TABS.flatMap((t) => t.segments);
    expect([...all].sort()).toEqual([...new Set(INS_NAV_FLAT.map((n) => n.segment))].sort());
  });
  it("resuelve la pestaña de una ruta y no de los ajustes", () => {
    expect(tabForPath("/dashboard/projects/p1", "p1")?.key).toBe("home");
    expect(tabForPath("/dashboard/projects/p1/competitors", "p1")?.key).toBe("ia");
    expect(tabForPath("/dashboard/projects/p1/web-audit/x", "p1")?.key).toBe("web");
    expect(tabForPath("/dashboard/projects/p1/search-console", "p1")?.key).toBe("google");
    expect(tabForPath("/dashboard/settings", "p1")).toBeNull();
  });
  it("una pestaña recuerda la última pantalla vista y si no, abre la primera", () => {
    const ia = INS_TABS.find((t) => t.key === "ia")!;
    expect(tabTarget(ia, {})).toBe("/prompts");
    expect(tabTarget(ia, { ia: "/citations" })).toBe("/citations");
    expect(tabTarget(ia, { ia: "/web-audit" })).toBe("/prompts");
  });
  it("solo las familias con varias pantallas llevan botones", () => {
    expect(tabSubItems(INS_TABS[0])).toEqual([]);
    expect(tabSubItems(INS_TABS.find((t) => t.key === "ia")!)).toHaveLength(3);
    // Buscadores: solo Posición en Google, sin botones
    expect(tabSubItems(INS_TABS.find((t) => t.key === "google")!)).toEqual([]);
    // Tu web: las dos auditorías de la misma ruta (log §391)
    expect(tabSubItems(INS_TABS.find((t) => t.key === "web")!).map((n) => n.pin)).toEqual(["Para la IA", "Para Google"]);
  });
  it("seis pestañas con Buscadores y Tu web (log §391)", () => {
    expect(INS_TABS.map((t) => t.short)).toEqual(["Inicio", "Plan", "En la IA", "Buscadores", "Tu web", "Agentes"]);
  });
  it("sin rayas largas", () => {
    expect(JSON.stringify(INS_TABS)).not.toContain("—");
  });
});

describe("cambio de dominio", () => {
  it("conserva la sección de primer nivel", () => {
    expect(switchProjectHref("/dashboard/projects/p1/competitors", "p2")).toBe("/dashboard/projects/p2/competitors");
    expect(switchProjectHref("/dashboard/projects/p1/runs/r9", "p2")).toBe("/dashboard/projects/p2/runs");
  });
  it("cae en la portada del proyecto desde la visión general o fuera de un proyecto", () => {
    expect(switchProjectHref("/dashboard/projects/p1", "p2")).toBe("/dashboard/projects/p2");
    expect(switchProjectHref("/dashboard/settings", "p2")).toBe("/dashboard/projects/p2");
  });
});
