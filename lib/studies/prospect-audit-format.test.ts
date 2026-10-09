import { describe, expect, it } from "vitest";
import { collectJsonLdTypes, extractTitle, formatAuditSection, type ProspectAudit } from "./prospect-audit-format";

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
  sitemapInvalid: false,
  keyBots: [],
  evidence: null
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

describe("evidence", () => {
  it("collects every JSON-LD type, nested and @graph, and skips malformed blocks", () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"ProfessionalService","address":{"@type":"PostalAddress"}},{"@type":["WebSite"]}]}</script><script type="application/ld+json">{bad</script>`;
    expect(collectJsonLdTypes(html)).toEqual(["PostalAddress", "ProfessionalService", "WebSite"]);
    expect(extractTitle("<title>\n Agencia | SEO </title>")).toBe("Agencia / SEO");
    expect(extractTitle("<p>sin título</p>")).toBeNull();
  });

  it("prints one row per requested check, with the measured value", () => {
    const text = formatAuditSection({
      ...base,
      keyBots: [
        { agent: "GPTBot", allowed: false },
        { agent: "Google-Extended", allowed: true },
        { agent: "ClaudeBot", allowed: true }
      ],
      evidence: {
        finalUrl: "https://acme.es/",
        title: "Acme",
        titleLength: 4,
        descriptionLength: 0,
        jsonLdTypes: ["LocalBusiness"],
        wordCount: 12,
        contentOk: false,
        h1Count: 1
      }
    });
    expect(text).toContain("| robots.txt para GPTBot, ClaudeBot, Google-Extended | Mejorar | GPTBot: bloqueado");
    expect(text).toContain("| Schema Organization / LocalBusiness | Bien | tipos JSON-LD encontrados: LocalBusiness |");
    expect(text).toContain("| Título | Mejorar | «Acme» (4 caracteres");
    expect(text).toContain("| Meta description | Mejorar | no tiene");
    expect(text).toContain("muestra 12 palabras visibles");
  });
});
