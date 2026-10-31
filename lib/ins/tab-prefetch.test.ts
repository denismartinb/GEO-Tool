import { describe, expect, it } from "vitest";
import { INS_TABS } from "./nav";
import { tabPrefetchTargets } from "./tab-prefetch";

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
