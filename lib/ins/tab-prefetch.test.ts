import { describe, expect, it } from "vitest";
import { tabPrefetchTargets } from "./tab-prefetch";

describe("precarga de pestañas de la app", () => {
  it("devuelve la primera pantalla de cada pestaña menos la abierta", () => {
    expect(tabPrefetchTargets("/dashboard/projects/p1")).toEqual([
      "/dashboard/projects/p1/recommendations",
      "/dashboard/projects/p1/prompts",
      "/dashboard/projects/p1/search-console",
      "/dashboard/projects/p1/agentic-visibility"
    ]);
    expect(tabPrefetchTargets("/dashboard/projects/p1/prompts")).toContain("/dashboard/projects/p1");
    expect(tabPrefetchTargets("/dashboard/projects/p1/prompts")).not.toContain("/dashboard/projects/p1/prompts");
  });
  it("fuera de un proyecto no precarga nada", () => {
    expect(tabPrefetchTargets("/dashboard")).toEqual([]);
    expect(tabPrefetchTargets("/dashboard/settings")).toEqual([]);
  });
});
