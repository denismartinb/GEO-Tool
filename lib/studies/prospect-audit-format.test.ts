import { describe, expect, it } from "vitest";
import { formatAuditSection, type ProspectAudit } from "./prospect-audit-format";

const base: ProspectAudit = {
  domain: "acme.es",
  homepageStatus: "analyzed",
  homepageScore: 62,
  issues: [],
  passing: [],
  robots: "found",
  trackedBots: 7,
  blockedBots: [],
  llmsTxt: "absent",
  sitemap: "found",
  sitemapLocs: 40,
  sitemapInvalid: false
};

describe("formatAuditSection", () => {
  it("states its scope and reports only what was measured", () => {
    const text = formatAuditSection({
      ...base,
      issues: [
        { check: "bot_blocked", severity: "critical", affectedCount: 1, applicableCount: 7, pointDelta: null, affectedLabels: ["GPTBot"] },
        { check: "llms_txt_missing", severity: "warning", affectedCount: 1, applicableCount: 1, pointDelta: null, affectedLabels: [] }
      ],
      passing: [{ check: "single_h1", passedCount: 1, applicableCount: 1 }],
      blockedBots: ["GPTBot"]
    });
    expect(text).toContain("No es una auditoría del sitio entero");
    expect(text).toContain("62/100");
    expect(text).toContain("GPTBot (de 7 vigilados)");
    expect(text).toContain("| Crítico | Acceso de bots de IA (GPTBot) |");
    expect(text).toContain("**llms.txt:** no existe");
    expect(text).toContain("**sitemap.xml:** sí (40 URLs)");
    expect(text).toContain("**Ya está bien:** Un solo <h1>.");
  });

  it("never claims a clean result for what it could not read", () => {
    const text = formatAuditSection({ ...base, homepageStatus: "skipped_timeout", homepageScore: null, robots: "unknown", llmsTxt: "unknown" });
    expect(text).toContain("no se pudo analizar (la portada tardó demasiado en responder)");
    expect(text).toContain("no se pudo leer robots.txt");
    expect(text).toContain("**llms.txt:** no se pudo comprobar");
    expect(text).not.toContain("No hay problemas técnicos");
    expect(text).not.toContain("ninguno de los");
  });

  it("a soft-404 sitemap is not reported as present", () => {
    const text = formatAuditSection({ ...base, sitemapLocs: null, sitemapInvalid: true });
    expect(text).toContain("no contiene un sitemap válido");
  });
});
