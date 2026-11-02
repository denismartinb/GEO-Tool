import { describe, expect, it } from "vitest";
import type { AgentAccess } from "@/lib/agentic-audit/api-contract";
import type { PageSignals } from "@/lib/agentic-audit/html-signals";
import { buildInterop } from "@/lib/agentic-audit/interop";
import { scoreAgenticAudit, scoreIfChecksPass, type ScoreInput } from "@/lib/agentic-audit/score";
import { firstSteps } from "@/lib/agentic-audit/console-model";
import { buildAuditBlock } from "@/lib/web-audit/audit-blocks";
import { buildTechnicalIssuesReport } from "@/lib/web-audit/issues";
import { ISSUE_CHECK_META } from "@/lib/web-audit/issue-labels";
import type { PageCheckResult } from "@/lib/web-audit/page-checks";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import { TRACKED_BOT_AGENTS, type BotAccessReport } from "@/lib/web-audit/robots";
import { EXT_AUDIT_ISSUES, buildExtAudits } from "@/lib/ext/audits";

type Overrides = {
  structured?: boolean;
  h1?: boolean;
  h2?: boolean;
  intro?: boolean;
  title?: boolean;
  description?: boolean;
  og?: boolean;
  noindex?: boolean;
  canonical?: boolean;
  hreflang?: boolean;
  list?: boolean;
  content?: boolean;
  freshness?: "fresh" | "aging" | "stale" | "unknown";
};

/** A page check with a pageScore computed the way page-checks.ts does. */
function check(o: Overrides = {}): PageCheckResult {
  const v = { structured: true, h1: true, h2: true, intro: true, title: true, description: true, og: true, noindex: false, canonical: true, hreflang: true, list: true, content: true, freshness: "fresh" as const, ...o };
  const baseline =
    (v.structured ? 15 : 0) +
    (v.h1 ? 5 : 0) + (v.h2 ? 5 : 0) + (v.intro ? 5 : 0) +
    (v.title ? 5 : 0) + (v.description ? 5 : 0) + (v.og ? 5 : 0) +
    (v.noindex ? 0 : 10) + (v.canonical ? 5 : 0) + (v.hreflang ? 5 : 0) +
    (v.list ? 10 : 0) + (v.content ? 10 : 0);
  const fresh = v.freshness === "fresh" ? 15 : v.freshness === "aging" ? 8 : 0;
  const pageScore = v.freshness === "unknown" ? Math.round((baseline / 85) * 100) : baseline + fresh;
  return {
    structuredData: { pass: v.structured, matchedTypes: v.structured ? ["Article"] : [] },
    answerFormat: { points: 0, hasOneH1: v.h1, hasTwoH2: v.h2, hasAnswerFirstIntro: v.intro, h1Count: v.h1 ? 1 : 0, h2Count: v.h2 ? 2 : 0 },
    metadata: { points: 0, titleOk: v.title, descriptionOk: v.description, ogOk: v.og, titleLength: 40, descriptionLength: 100 },
    freshness: { status: v.freshness, points: fresh, date: v.freshness === "unknown" ? null : "2026-07-01T00:00:00.000Z" },
    indexability: { points: 0, canonicalPresent: v.canonical, canonicalOk: v.canonical, canonicalUrl: null, noindex: v.noindex, hreflangPresent: v.hreflang },
    citability: { points: 0, hasListOrTable: v.list, wordCount: v.content ? 500 : 50, contentOk: v.content },
    pageScore
  } as PageCheckResult;
}

function page(url: string, c: PageCheckResult): PageAuditEntry {
  return { url, contextLabel: "verificada", status: "analyzed", check: c, fetchMs: 100, htmlBytes: 1000 };
}

function bots(overrides: Partial<BotAccessReport> = {}): BotAccessReport {
  return {
    robotsFound: true,
    bots: TRACKED_BOT_AGENTS.map((agent) => ({ agent, allowed: true })),
    llmsTxtFound: true,
    llmsTxtBytes: 200,
    sitemapFound: true,
    ...overrides
  };
}

const FULL: PageSignals = {
  hasProductData: true,
  hasOffer: true,
  structuredPrice: true,
  textPrice: true,
  availability: true,
  gtin: true,
  skuOrMpn: true,
  shippingData: true,
  returnPolicyData: true,
  reviewData: true,
  organizationData: true,
  ogProduct: true,
  visibleTextChars: 2000,
  links: { returns: true, shipping: true, legal: true, contact: true, cancellation: true },
  platform: "Shopify",
  addToCart: true,
  quickPay: ["Shop Pay"],
  captcha: null,
  offerTypes: [],
  anyOffer: true,
  recurringPrice: false,
  buyCta: false,
  bookingWidget: null,
  paymentPlatform: null
};

const ALL_IN: AgentAccess[] = (["ChatGPT", "Claude", "Perplexity", "Gemini"] as const).map((assistant) => ({
  assistant,
  allowed: true
}));

const base: ScoreInput = {
  domain: "tienda.es",
  url: "https://tienda.es/p/x",
  signals: FULL,
  agents: ALL_IN,
  challenge: false,
  sitemap: "found",
  interop: buildInterop({
    ucp: { state: "absent", body: null },
    mcpCard: { state: "absent", body: null },
    agentCard: { state: "absent", body: null },
    agentCardLegacy: { state: "absent", body: null },
    feed: null,
    feedPlatform: null
  })
};

const weak = scoreAgenticAudit({
  ...base,
  signals: { ...FULL, gtin: false, skuOrMpn: false, returnPolicyData: false, availability: false, quickPay: [] }
});


const AT = "2026-10-31T06:00:00.000Z";
const pages = [
  page("https://www.marca.es/", check({ freshness: "unknown", title: false })),
  page("https://www.marca.es/precios", check({ intro: false, noindex: true })),
  page("https://www.marca.es/blog", check({ list: false, description: false }))
];

describe("buildExtAudits (EXT-AUDITS-1, log §406)", () => {
  it("takes the GEO and SEO blocks from buildAuditBlock, never recomputed", () => {
    const r = buildExtAudits({ snapshot: { pages, bots: bots(), createdAt: AT }, agentic: null, ownUrl: null });
    const report = buildTechnicalIssuesReport(pages, bots());
    for (const key of ["geo", "seo"] as const) {
      const view = buildAuditBlock(key, pages, report, bots());
      const b = r.blocks.find((x) => x.key === key)!;
      expect(b.score).toBe(view.score);
      expect(b.issues.length).toBeLessThanOrEqual(EXT_AUDIT_ISSUES);
      expect(b.issues.map((i) => i.label)).toEqual(view.issues.slice(0, EXT_AUDIT_ISSUES).map((i) => ISSUE_CHECK_META[i.issue.check].label));
      expect(b.issues.map((i) => i.points)).toEqual(view.issues.slice(0, EXT_AUDIT_ISSUES).map((i) => i.blockPoints));
      // «Si arreglas estos tres» only when the three are every scored issue
      expect(b.projected).toBe(view.scoredIssueCount <= EXT_AUDIT_ISSUES && view.projectedScore! > view.score! ? view.projectedScore : null);
      // The plugin's one-click fix needs the check and the failing pages (WP-PLUGIN-3)
      expect(b.issues.map((i) => i.check)).toEqual(view.issues.slice(0, EXT_AUDIT_ISSUES).map((i) => i.issue.check));
      for (const i of b.issues) expect(i.urls.every((u) => /^https?:\/\//.test(u))).toBe(true);
      // The header's «25 → 100» is the whole block, however many issues it has
      expect(b.projectedAll).toBe(view.projectedScore! > view.score! ? view.projectedScore : null);
    }
    expect(r.auditedAt).toBe(AT);
    expect(r.page).toBeNull();
    // «Toda la web» in the panel is the Salud técnica, read from its owner (log §433)
    expect(r.readiness).toBe(report.actualReadinessScore);
    expect(r.readiness).not.toBeNull();
  });

  it("takes the agentic block from the review's own steps and score", () => {
    const r = buildExtAudits({ snapshot: null, agentic: weak, ownUrl: null });
    const b = r.blocks.find((x) => x.key === "agent")!;
    const steps = firstSteps(weak, EXT_AUDIT_ISSUES);
    expect(b.score).toBe(weak.score);
    expect(b.issues.map((i) => i.label)).toEqual(steps.map((s) => s.title));
    expect(b.issues.map((i) => i.check)).toEqual(steps.map((s) => s.checkId));
    expect(b.projected).toBe(scoreIfChecksPass(weak, new Set(steps.map((s) => s.checkId))));
    const all = firstSteps(weak, Number.MAX_SAFE_INTEGER);
    expect(b.projectedAll).toBe(scoreIfChecksPass(weak, new Set(all.map((s) => s.checkId))));
  });

  it("crosses the open page with the audit, and says when it was not audited", () => {
    const own = buildExtAudits({ snapshot: { pages, bots: bots(), createdAt: AT }, agentic: null, ownUrl: "https://marca.es/precios/?utm_source=x" });
    expect(own.page).toEqual({
      state: "audited",
      aiBotsAllowed: true,
      indexable: false,
      issues: expect.arrayContaining([{ label: ISSUE_CHECK_META.answer_first_intro.label, block: "geo" }, { label: ISSUE_CHECK_META.noindex.label, block: "seo" }])
    });
    const other = buildExtAudits({ snapshot: { pages, bots: bots(), createdAt: AT }, agentic: null, ownUrl: "https://www.marca.es/contacto" });
    expect(other.page).toEqual({ state: "not_audited" });
    const blocked = buildExtAudits({ snapshot: { pages, bots: bots({ bots: TRACKED_BOT_AGENTS.map((agent) => ({ agent, allowed: agent !== "OAI-SearchBot" })) }), createdAt: AT }, agentic: null, ownUrl: "https://www.marca.es/" });
    expect(blocked.page && blocked.page.state === "audited" && blocked.page.aiBotsAllowed).toBe(false);
  });

  it("without an audit there is nothing to show, not a zero", () => {
    expect(buildExtAudits({ snapshot: null, agentic: null, ownUrl: "https://marca.es/" })).toEqual({ auditedAt: null, readiness: null, blocks: [], page: null });
  });
});
