import { describe, expect, it } from "vitest";
import type { TechnicalIssuesReport } from "@/lib/web-audit/issues";
import { buildReportTechChecks } from "./report-tech";

function report(over: Partial<TechnicalIssuesReport>): TechnicalIssuesReport {
  return {
    issues: [],
    passing: [],
    analyzedPageCount: 3,
    actualReadinessScore: 70,
    projectedReadinessScore: 90,
    totalPointPotential: 20,
    ...over
  };
}

describe("buildReportTechChecks", () => {
  it("shows passing checks as ok and failing ones with their state", () => {
    const rows = buildReportTechChecks(
      report({
        passing: [
          { check: "bot_blocked", passedCount: 8, applicableCount: 8 },
          { check: "llms_txt_missing", passedCount: 1, applicableCount: 1 }
        ],
        issues: [
          { check: "sitemap_missing", severity: "warning", affectedCount: 1, applicableCount: 1, pointDelta: null, affectedLabels: [] },
          { check: "structured_data", severity: "warning", affectedCount: 1, applicableCount: 4, pointDelta: 4, affectedLabels: ["a"] }
        ]
      })
    );
    expect(rows.map((r) => [r.label, r.state, r.text])).toEqual([
      ["Bots de IA con acceso", "ok", "Todos"],
      ["llms.txt", "ok", "Lo tienes"],
      ["Mapa del sitio", "warn", "No responde"],
      ["Datos estructurados", "warn", "Falla en el 25% de las páginas"]
    ]);
  });

  it("names the blocked bots and marks a total failure as bad", () => {
    const rows = buildReportTechChecks(
      report({
        issues: [
          { check: "bot_blocked", severity: "critical", affectedCount: 2, applicableCount: 8, pointDelta: null, affectedLabels: ["GPTBot", "ClaudeBot"] },
          { check: "answer_first_intro", severity: "improvement", affectedCount: 3, applicableCount: 3, pointDelta: 5, affectedLabels: [] }
        ]
      })
    );
    expect(rows[0]).toMatchObject({ state: "bad", text: "Bloqueas a GPTBot, ClaudeBot" });
    expect(rows[1]).toMatchObject({ state: "bad", text: "Falla en todas las páginas" });
  });

  it("leaves out a check that was never measured", () => {
    expect(buildReportTechChecks(report({}))).toEqual([]);
  });

  it("never prints an absolute page count", () => {
    const rows = buildReportTechChecks(
      report({ issues: [{ check: "title_length", severity: "warning", affectedCount: 2, applicableCount: 7, pointDelta: 3, affectedLabels: [] }] })
    );
    expect(JSON.stringify(rows)).not.toMatch(/\b\d+ de \d+\b/);
  });
});
