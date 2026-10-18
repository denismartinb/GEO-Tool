import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { isAlreadyCovered, type CoverageOverlayEntry } from "./coverage-overlay";
import {
  ResolvedHistoryCard,
  predictionVerdictLine,
  type ResolvedHistoryItem
} from "@/app/dashboard/projects/[projectId]/recommendations/recommendations-client";

// RECS-ALREADY-DONE-1 (log §339): Denis, 2026-10-18 (P11, P22, P23 in
// prueba-recomendaciones/aprendizajes.md): «si ya lo tengo hecho esas tarjetas
// no deberían aparecer, deberían aparecer en la pestaña de resueltas ya tachadas».

const found: CoverageOverlayEntry = {
  state: "confirmed_surfacing_gap",
  verifiedPage: { url: "https://www.genscore.es/geo", title: "" },
  confidenceOverride: "high"
};

describe("isAlreadyCovered", () => {
  it("closes a card whose only action is a page that already exists", () => {
    expect(isAlreadyCovered("increase_brand_visibility", found)).toBe(true);
    expect(isAlreadyCovered("close_competitor_gap", found)).toBe(true);
    expect(isAlreadyCovered("add_comparison_content", found)).toBe(true);
  });

  it("keeps a citation card: finding the page says nothing about the fact it asks for", () => {
    expect(isAlreadyCovered("add_citation_block", found)).toBe(false);
  });

  it("keeps every card coverage could not certify", () => {
    for (const state of ["possible_content_gap", "home_only", "no_editable_page", "listing_only", "none"] as const) {
      expect(isAlreadyCovered("increase_brand_visibility", { ...found, state })).toBe(false);
    }
    expect(isAlreadyCovered("increase_brand_visibility", { ...found, verifiedPage: null })).toBe(false);
    expect(isAlreadyCovered("increase_brand_visibility", null)).toBe(false);
  });
});

describe("«Ya lo tienes» under Resueltas", () => {
  const item: ResolvedHistoryItem = {
    id: "c1",
    title: "Aparece en «que significa geo»",
    description: "",
    recommendation_type: "increase_brand_visibility",
    status: "covered",
    updated_at: "2026-10-18T10:00:00Z",
    run_id: "run-current",
    coveredPageUrl: "https://www.genscore.es/geo/"
  };

  it("is crossed out, says so and links the page, with no undo", () => {
    const html = renderToStaticMarkup(<ResolvedHistoryCard item={item} projectId="p1" latestCompletedRunId="run-current" />);
    expect(html).toContain("Ya lo tienes");
    expect(html).toContain("line-through");
    expect(html).toContain("Ya tienes una página que responde a esta pregunta:");
    expect(html).toContain('href="https://www.genscore.es/geo/"');
    expect(html).toContain("genscore.es/geo<");
    expect(html).not.toContain("Deshacer");
    expect(predictionVerdictLine(item)).toBeNull();
  });

  it("names a comparison as a comparison", () => {
    const html = renderToStaticMarkup(
      <ResolvedHistoryCard
        item={{ ...item, recommendation_type: "close_competitor_gap" }}
        projectId="p1"
        latestCompletedRunId="run-current"
      />
    );
    expect(html).toContain("Ya tienes una comparativa con este competidor:");
  });

  it("never links anything that is not a web address", () => {
    const html = renderToStaticMarkup(
      <ResolvedHistoryCard item={{ ...item, coveredPageUrl: "javascript:alert(1)" }} projectId="p1" latestCompletedRunId="run-current" />
    );
    expect(html).not.toContain("javascript:");
  });
});
