import { describe, expect, it } from "vitest";
import { INS_TABS } from "./nav";
import { shouldPrefetchTabs, tabPrefetchTargets } from "./tab-prefetch";

// Derived from INS_TABS on purpose: the number and order of tabs can change
// (log §380 and later) without touching the prefetch.
const base = "/dashboard/projects/p1";
const all = INS_TABS.map((t) => `${base}${t.segments[0]}`);

describe("precarga de pestañas de la app", () => {
  it("devuelve la primera pantalla de cada pestaña de INS_TABS menos la abierta", () => {
    expect(tabPrefetchTargets(base)).toEqual(all.filter((h) => h !== base));
    const second = all[1];
    expect(tabPrefetchTargets(second)).toEqual(all.filter((h) => h !== second));
    expect(tabPrefetchTargets(`${base}/settings-x`)).toEqual(all);
  });
  it("fuera de un proyecto no precarga nada", () => {
    expect(tabPrefetchTargets("/dashboard")).toEqual([]);
    expect(tabPrefetchTargets("/dashboard/settings")).toEqual([]);
  });
});

describe("cuándo se precargan las pestañas", () => {
  it("en la app siempre, aunque el teléfono ahorre datos", () => {
    expect(shouldPrefetchTabs({ inApp: true, tabBarVisible: false, saveData: true })).toBe(true);
  });
  it("en la web solo con la barra inferior visible", () => {
    expect(shouldPrefetchTabs({ inApp: false, tabBarVisible: true })).toBe(true);
    expect(shouldPrefetchTabs({ inApp: false, tabBarVisible: false })).toBe(false);
  });
  it("en la web no con ahorro de datos ni conexión lenta", () => {
    expect(shouldPrefetchTabs({ inApp: false, tabBarVisible: true, saveData: true })).toBe(false);
    for (const effectiveType of ["slow-2g", "2g", "3g"]) {
      expect(shouldPrefetchTabs({ inApp: false, tabBarVisible: true, effectiveType })).toBe(false);
    }
    expect(shouldPrefetchTabs({ inApp: false, tabBarVisible: true, effectiveType: "4g" })).toBe(true);
  });
});
