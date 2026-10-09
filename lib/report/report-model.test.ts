import { describe, expect, it } from "vitest";
import { buildReportModel, findQuote, formatShare, type ReportAnswer, type ReportInput } from "./report-model";

function ans(
  promptId: string,
  provider: string,
  opts: {
    topic?: string | null;
    named?: boolean;
    position?: number | null;
    competitors?: Array<{ name: string; position?: number }>;
    others?: string[];
    citations?: string[];
    rawText?: string | null;
  } = {}
): ReportAnswer {
  return {
    promptId,
    promptText: `Pregunta ${promptId}`,
    topic: opts.topic === undefined ? "Local" : opts.topic,
    provider,
    rawText: opts.rawText ?? null,
    extracted: {
      brand: { mentioned: Boolean(opts.named), position: opts.named ? (opts.position ?? 1) : null },
      competitors: (opts.competitors ?? []).map((c) => ({ name: c.name, mentioned: true, position: c.position ?? 2 })),
      other_brands_mentioned: opts.others ?? [],
      citations: (opts.citations ?? []).map((u) => ({ url: `https://${u}`, domain: u.split("/")[0] }))
    }
  };
}

function input(answers: ReportAnswer[], over: Partial<ReportInput> = {}): ReportInput {
  return {
    brandName: "Acme",
    brandAliases: ["Acme Studio"],
    domain: "acme.es",
    scanDate: "2026-10-09",
    geoScore: 41,
    answers,
    competitors: [{ name: "Rival", domain: "rival.es" }],
    coverage: { p1: "yes", p2: "no", p3: "no" },
    technical: { score: 90, checks: [{ label: "llms.txt", detail: null, state: "ok", text: "Lo tienes" }] },
    plan: [],
    ...over
  };
}

// Six answers: two engines × three questions.
const BASE: ReportAnswer[] = [
  ans("p1", "gemini", { named: true, position: 1, citations: ["acme.es/benissa", "rival.es"], rawText: "Te recomiendo **Acme**, que trabaja en Benissa con mucha experiencia local." }),
  ans("p1", "openai", { named: true, position: 2, competitors: [{ name: "Rival", position: 1 }], citations: ["sortlist.es"] }),
  ans("p2", "gemini", { competitors: [{ name: "rival" }], others: ["Otra Marca", "ChatGPT"], citations: ["rival.es", "elpais.com"], rawText: "Rival es una agencia muy conocida en la zona de Alicante desde hace años." }),
  ans("p2", "openai", { competitors: [{ name: "Rival" }] }),
  ans("p3", "gemini", { topic: "Precios" }),
  ans("p3", "openai", { topic: "Precios", others: ["Acme Studio"] })
];

describe("buildReportModel", () => {
  it("returns null when the scan has no answers", () => {
    expect(buildReportModel(input([]))).toBeNull();
  });

  it("computes the cover and per-engine shares from the answers", () => {
    const m = buildReportModel(input(BASE))!;
    expect(m.cover.mentionShare).toBeCloseTo(2 / 6);
    expect(m.engines.map((e) => e.provider)).toEqual(["gemini", "openai"]);
    expect(m.engines[0]).toMatchObject({ label: "Gemini", bestPosition: 1, citesOwnSite: true });
    expect(m.engines[1]).toMatchObject({ label: "ChatGPT", bestPosition: 2, citesOwnSite: false });
  });

  it("never counts the brand's own alias or an AI assistant as another brand", () => {
    const m = buildReportModel(input(BASE))!;
    const names = m.competition.cloud.map((c) => c.name);
    expect(names).not.toContain("ChatGPT");
    expect(names).not.toContain("Acme Studio");
    // tracked competitor spelled differently collapses onto its canonical name
    expect(names.filter((n) => n.toLowerCase() === "rival")).toEqual(["Rival"]);
  });

  it("builds the question × engine matrix with the coverage gap", () => {
    const m = buildReportModel(input(BASE))!;
    const local = m.matrix.groups.find((g) => g.topic === "Local")!;
    const p1 = local.rows.find((r) => r.promptId === "p1")!;
    expect(p1.cells.map((c) => c.cell)).toEqual([{ kind: "you", position: 1 }, { kind: "you", position: 2 }]);
    expect(p1.page).toBe("yes");
    const p2 = local.rows.find((r) => r.promptId === "p2")!;
    expect(p2.cells[0].cell).toEqual({ kind: "others" });
    expect(p2.page).toBe("gap");
    const p3 = m.matrix.groups.find((g) => g.topic === "Precios")!.rows[0];
    expect(p3.cells[0].cell).toEqual({ kind: "none" });
    expect(p3.page).toBe("no");
  });

  it("leaves the page column empty when there is no coverage audit", () => {
    const m = buildReportModel(input(BASE, { coverage: null, technical: null }))!;
    expect(m.matrix.hasCoverage).toBe(false);
    expect(m.matrix.groups.flatMap((g) => g.rows).every((r) => r.page === null)).toBe(true);
    expect(m.technical).toBeNull();
  });

  it("names the direct rival from the answers that do not name the brand", () => {
    const m = buildReportModel(input(BASE))!;
    expect(m.competition.cards[0]).toMatchObject({ name: "Rival", eyebrow: "Tu rival directo · la marca más nombrada" });
    expect(m.competition.cards[0].quote?.text).toBe("Rival es una agencia muy conocida en la zona de Alicante desde hace años.");
    expect(m.competition.bars.some((b) => b.isBrand)).toBe(true);
  });

  it("groups cited sources by type and measures the brand's own share", () => {
    const m = buildReportModel(input(BASE))!;
    const cols = Object.fromEntries(m.sources!.columns.map((c) => [c.title, c.domains]));
    expect(cols["Tus competidores"]).toEqual(["rival.es"]);
    expect(m.sources!.columns[0].includesOwn).toBe(true);
    expect(m.sources!.ownCitationShare).toBeCloseTo(1 / 5);
    expect(m.sources!.ownPages).toEqual(["acme.es/benissa"]);
    expect(m.sources!.topSource).toEqual({ domain: "rival.es", share: 2 / 3 });
    expect(m.sources!.brandQuotes[0].text).toBe("Te recomiendo Acme, que trabaja en Benissa con mucha experiencia local.");
  });

  it("omits the sources page when no engine cited anything", () => {
    const noCites = BASE.map((a) => ({ ...a, extracted: { ...(a.extracted as object), citations: [] } }));
    expect(buildReportModel(input(noCites))!.sources).toBeNull();
  });

  it("shows only the first three plan items, with engine names", () => {
    const item = { title: "T", description: "D", firstStep: null, providers: ["openai", "gemini", "openai"], topics: [] };
    const m = buildReportModel(input(BASE, { plan: [item, item, item, item] }))!;
    expect(m.plan).toHaveLength(3);
    expect(m.plan[0].engineLabels).toEqual(["ChatGPT", "Gemini"]);
  });

  it("never prints an absolute count, a model version or a question number", () => {
    const m = buildReportModel(input(BASE))!;
    const text = JSON.stringify(m);
    for (const re of [
      /\b\d+ de \d+\b/,
      /\b\d+ (preguntas|respuestas|escaneos|webs|motores)\b/i,
      /gpt-\d|gemini-\d|haiku|sonnet/i,
      /\bpregunta \d+\b/i
    ]) {
      // "Pregunta p1" fixtures are input text, not template output.
      expect(text.replace(/Pregunta p\d/g, "")).not.toMatch(re);
    }
    expect(m.summary.findings.map((f) => f.text).join(" ")).toContain("preguntas principales de búsqueda");
  });
});

describe("findQuote", () => {
  it("returns the literal sentence that names the brand, without markdown", () => {
    expect(findQuote("Intro corta. 1. **Acme** ofrece auditorías SEO para pymes de toda España.", ["Acme"])).toBe(
      "Acme ofrece auditorías SEO para pymes de toda España."
    );
  });

  it("returns null rather than inventing a quote", () => {
    expect(findQuote("Nada que ver con la marca en este texto largo.", ["Acme"])).toBeNull();
    expect(findQuote(null, ["Acme"])).toBeNull();
  });
});

describe("formatShare", () => {
  it("rounds and marks tiny non-zero shares", () => {
    expect(formatShare(0)).toBe("0%");
    expect(formatShare(0.004)).toBe("<1%");
    expect(formatShare(0.3333)).toBe("33%");
  });
});
