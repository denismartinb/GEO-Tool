import { describe, expect, it } from "vitest";
import type { PageCheckResult, SeoPageCheck } from "@/lib/web-audit/page-checks";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import { TRACKED_BOT_AGENTS, type BotAccessReport } from "@/lib/web-audit/robots";
import { AUDIT_BLOCKS } from "@/lib/web-audit/audit-blocks";
import { pageCheckWeight } from "@/lib/web-audit/issues";
import {
  PAGESPEED_REFRESH_MS,
  SEO_EXTRA_WEIGHTS,
  buildSeoExtras,
  duplicateMetadataUrls,
  formatVital,
  parsePageSpeedResponse,
  rateVital,
  reusablePageSpeed,
  seoSiteStates,
  speedShare,
  worstVital,
  type SeoExtraCheckKey,
  type SiteSeoReport
} from "@/lib/web-audit/seo-health";

function seo(overrides: Partial<SeoPageCheck> = {}): SeoPageCheck {
  return {
    viewportOk: true,
    imageCount: 3,
    imagesMissingAlt: 0,
    localBusiness: false,
    titleKey: "t-a",
    descriptionKey: "d-a",
    pageKey: "a",
    ...overrides
  };
}

function check(s: SeoPageCheck | undefined, canonicalUrl: string | null = null): PageCheckResult {
  return {
    structuredData: { pass: true, matchedTypes: ["Article"] },
    answerFormat: { points: 15, hasOneH1: true, hasTwoH2: true, hasAnswerFirstIntro: true, h1Count: 1, h2Count: 2 },
    metadata: { points: 15, titleOk: true, descriptionOk: true, ogOk: true, titleLength: 40, descriptionLength: 100 },
    freshness: { status: "fresh", points: 15, date: "2026-07-01T00:00:00.000Z" },
    indexability: { points: 20, canonicalPresent: true, canonicalOk: true, canonicalUrl, noindex: false, hreflangPresent: true },
    citability: { points: 20, hasListOrTable: true, wordCount: 500, contentOk: true },
    pageScore: 100,
    ...(s ? { seo: s } : {})
  };
}

function page(url: string, c: PageCheckResult): PageAuditEntry {
  return { url, contextLabel: "verificada", status: "analyzed", check: c, fetchMs: 100, htmlBytes: 1000 };
}

function bots(site?: SiteSeoReport): BotAccessReport {
  return {
    robotsFound: true,
    bots: TRACKED_BOT_AGENTS.map((agent) => ({ agent, allowed: true })),
    llmsTxtFound: true,
    llmsTxtBytes: 10,
    sitemapFound: true,
    ...(site ? { site } : {})
  };
}

const NOW = new Date("2026-10-11T10:00:00Z");

describe("Salud SEO weights", () => {
  it("add up to 100 with the eight SEO checks that already score (founder, 2026-10-11)", () => {
    const old = AUDIT_BLOCKS.seo.checks
      .filter((c) => !(c in SEO_EXTRA_WEIGHTS))
      .reduce((sum, c) => sum + (pageCheckWeight(c) ?? 0), 0);
    const extra = Object.values(SEO_EXTRA_WEIGHTS).reduce<number>((sum, w) => sum + (w ?? 0), 0);
    expect(old).toBe(45);
    expect(extra).toBe(55);
    expect(SEO_EXTRA_WEIGHTS.local_business_missing).toBeNull();
  });

  it("puts every new check in the SEO block", () => {
    for (const key of Object.keys(SEO_EXTRA_WEIGHTS) as SeoExtraCheckKey[]) {
      expect(AUDIT_BLOCKS.seo.checks).toContain(key);
      expect(AUDIT_BLOCKS.geo.checks).not.toContain(key);
    }
  });
});

describe("Core Web Vitals", () => {
  it("rates against Google's thresholds, inclusive at «good»", () => {
    expect(rateVital("lcp", 2500)).toBe("good");
    expect(rateVital("lcp", 2501)).toBe("needs_improvement");
    expect(rateVital("lcp", 4001)).toBe("poor");
    expect(rateVital("inp", 200)).toBe("good");
    expect(rateVital("cls", 0.25)).toBe("needs_improvement");
    expect(rateVital("cls", 0.26)).toBe("poor");
  });

  it("formats in Spanish with Google's units", () => {
    expect(formatVital("lcp", 3400)).toBe("3,4 s");
    expect(formatVital("inp", 180.4)).toBe("180 ms");
    expect(formatVital("cls", 0.02)).toBe("0,02");
  });

  it("gives full, half or no credit per measured vital, and ignores the missing ones", () => {
    expect(speedShare({ source: "field", lcpMs: 2000, inpMs: 100, cls: 0.01 })).toBe(1);
    expect(speedShare({ source: "field", lcpMs: 3400, inpMs: 100, cls: 0.01 })).toBeCloseTo(5 / 6);
    expect(speedShare({ source: "lab", lcpMs: 5000, inpMs: null, cls: 0.01 })).toBe(0.5);
    expect(speedShare({ source: "lab", lcpMs: null, inpMs: null, cls: null })).toBeNull();
    expect(speedShare(null)).toBeNull();
  });

  it("names the worst vital, poor before needs-improvement", () => {
    expect(worstVital({ source: "field", lcpMs: 3000, inpMs: 600, cls: 0.01 })).toEqual({ key: "inp", value: 600, rating: "poor" });
    expect(worstVital({ source: "field", lcpMs: 3000, inpMs: 300, cls: 0.01 })).toEqual({ key: "lcp", value: 3000, rating: "needs_improvement" });
    expect(worstVital({ source: "field", lcpMs: 1000, inpMs: 100, cls: 0.01 })).toBeNull();
  });
});

describe("parsePageSpeedResponse", () => {
  it("prefers real-user data and reads CrUX CLS as a percentile ×100", () => {
    const json = {
      loadingExperience: {
        metrics: {
          LARGEST_CONTENTFUL_PAINT_MS: { percentile: 3400 },
          INTERACTION_TO_NEXT_PAINT: { percentile: 180 },
          CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 2 }
        }
      },
      lighthouseResult: { audits: { "largest-contentful-paint": { numericValue: 9999 } } }
    };
    expect(parsePageSpeedResponse(json)).toEqual({ source: "field", lcpMs: 3400, inpMs: 180, cls: 0.02 });
  });

  it("falls back to the lab run, which has no INP", () => {
    const json = {
      loadingExperience: { metrics: {} },
      lighthouseResult: {
        audits: { "largest-contentful-paint": { numericValue: 2800.5 }, "cumulative-layout-shift": { numericValue: 0.12 } }
      }
    };
    expect(parsePageSpeedResponse(json)).toEqual({ source: "lab", lcpMs: 2800.5, inpMs: null, cls: 0.12 });
  });

  it("returns null for anything unusable, without throwing", () => {
    expect(parsePageSpeedResponse(null)).toBeNull();
    expect(parsePageSpeedResponse("nope")).toBeNull();
    expect(parsePageSpeedResponse({ lighthouseResult: { audits: { "largest-contentful-paint": { numericValue: -1 } } } })).toBeNull();
  });
});

describe("reusablePageSpeed", () => {
  const mobile = { source: "field" as const, lcpMs: 2000, inpMs: 100, cls: 0.01 };
  it("reuses a report with mobile data younger than a week", () => {
    const report = { measuredAt: new Date(NOW.getTime() - PAGESPEED_REFRESH_MS + 60_000).toISOString(), mobile, desktop: null };
    expect(reusablePageSpeed(report, NOW)).toBe(report);
  });
  it("measures again after a week, without mobile data, or with a date from the future", () => {
    expect(reusablePageSpeed({ measuredAt: new Date(NOW.getTime() - PAGESPEED_REFRESH_MS).toISOString(), mobile, desktop: null }, NOW)).toBeNull();
    expect(reusablePageSpeed({ measuredAt: NOW.toISOString(), mobile: null, desktop: mobile }, NOW)).toBeNull();
    expect(reusablePageSpeed({ measuredAt: new Date(NOW.getTime() + 60_000).toISOString(), mobile, desktop: null }, NOW)).toBeNull();
    expect(reusablePageSpeed(null, NOW)).toBeNull();
  });
});

describe("duplicateMetadataUrls", () => {
  it("flags pages that share a title or a description", () => {
    const pages = [
      page("https://acme.com/a", check(seo({ titleKey: "same", descriptionKey: "d1", pageKey: "a" }))),
      page("https://acme.com/b", check(seo({ titleKey: "same", descriptionKey: "d2", pageKey: "b" }))),
      page("https://acme.com/c", check(seo({ titleKey: "t3", descriptionKey: "d3", pageKey: "c" })))
    ];
    expect([...duplicateMetadataUrls(pages)!].sort()).toEqual(["https://acme.com/a", "https://acme.com/b"]);
  });

  it("does not call one page a duplicate of itself: same final URL or same canonical", () => {
    const pages = [
      page("https://acme.com/", check(seo({ titleKey: "same", descriptionKey: "d1", pageKey: "home" }))),
      page("https://acme.com/?utm=x", check(seo({ titleKey: "same", descriptionKey: "d1", pageKey: "home" }))),
      page("https://acme.com/a", check(seo({ titleKey: "t2", descriptionKey: "d2", pageKey: "a" }), "https://acme.com/x")),
      page("https://acme.com/b", check(seo({ titleKey: "t2", descriptionKey: "d2", pageKey: "b" }), "https://acme.com/x"))
    ];
    expect(duplicateMetadataUrls(pages)!.size).toBe(0);
  });

  it("is null with fewer than two pages that measured it", () => {
    expect(duplicateMetadataUrls([page("https://acme.com/", check(seo()))])).toBeNull();
    expect(duplicateMetadataUrls([page("https://acme.com/", check(seo())), page("https://acme.com/b", check(undefined))])).toBeNull();
  });
});

describe("buildSeoExtras", () => {
  it("measures nothing on an old snapshot: no states, no issues, nothing passing", () => {
    const extras = buildSeoExtras([page("https://acme.com/", check(undefined))], bots());
    expect(extras).toEqual({ states: [], issues: [], passing: [] });
  });

  it("reports blocked Googlebot and a missing https redirect as critical", () => {
    const extras = buildSeoExtras([page("https://acme.com/", check(seo()))], bots({ googlebotAllowed: false, https: "missing" }));
    const byCheck = new Map(extras.issues.map((i) => [i.check, i]));
    expect(byCheck.get("googlebot_blocked")?.severity).toBe("critical");
    expect(byCheck.get("https_redirect")?.severity).toBe("critical");
    expect(byCheck.get("https_redirect")?.scopeText).toBe("http:// no redirige a https://");
  });

  it("leaves an unknown https result and an unread robots.txt out of the score", () => {
    const extras = buildSeoExtras([page("https://acme.com/", check(seo()))], bots({ https: "unknown" }));
    expect(extras.states.some((s) => s.check === "https_redirect" || s.check === "googlebot_blocked")).toBe(false);
    expect(extras.issues.some((i) => i.check === "https_redirect")).toBe(false);
    expect(extras.passing.some((p) => p.check === "https_redirect")).toBe(false);
  });

  it("rates the speed issue by the worst mobile vital and says which", () => {
    const slow = buildSeoExtras(
      [page("https://acme.com/", check(seo()))],
      bots({ pageSpeed: { measuredAt: NOW.toISOString(), mobile: { source: "field", lcpMs: 3400, inpMs: 100, cls: 0.01 }, desktop: null } })
    );
    const speed = slow.issues.find((i) => i.check === "page_speed")!;
    expect(speed.severity).toBe("warning");
    expect(speed.scopeText).toBe("LCP de 3,4 s en móvil (bueno: 2,5 s o menos)");

    const poor = buildSeoExtras(
      [page("https://acme.com/", check(seo()))],
      bots({ pageSpeed: { measuredAt: NOW.toISOString(), mobile: { source: "field", lcpMs: 5000, inpMs: 100, cls: 0.01 }, desktop: null } })
    );
    expect(poor.issues.find((i) => i.check === "page_speed")!.severity).toBe("critical");
  });

  it("counts site facts once per analyzed page and page facts once per measuring page", () => {
    const pages = [
      page("https://acme.com/a", check(seo({ imagesMissingAlt: 2, titleKey: "x", pageKey: "a" }))),
      page("https://acme.com/b", check(seo({ titleKey: "y", pageKey: "b" })))
    ];
    const extras = buildSeoExtras(pages, bots({ googlebotAllowed: true }));
    const count = (k: SeoExtraCheckKey) => extras.states.filter((s) => s.check === k).length;
    expect(count("googlebot_blocked")).toBe(2);
    expect(count("image_alt_missing")).toBe(2);
    expect(count("duplicate_metadata")).toBe(2);
    expect(extras.issues.find((i) => i.check === "image_alt_missing")?.affectedLabels).toEqual(["https://acme.com/a · 2 imágenes"]);
  });

  it("reports local business as an unscored improvement", () => {
    const extras = buildSeoExtras([page("https://acme.com/", check(seo()))], bots());
    expect(extras.issues.find((i) => i.check === "local_business_missing")?.severity).toBe("improvement");
    expect(extras.states.some((s) => s.check === "local_business_missing")).toBe(false);
    const declared = buildSeoExtras([page("https://acme.com/", check(seo({ localBusiness: true })))], bots());
    expect(declared.passing.find((p) => p.check === "local_business_missing")?.scopeText).toBe("Declarado");
  });
});

describe("seoSiteStates", () => {
  it("only scores what was measured", () => {
    expect(seoSiteStates(bots())).toEqual([]);
    expect(seoSiteStates(bots({ googlebotAllowed: true, https: "ok" })).map((s) => s.check)).toEqual(["googlebot_blocked", "https_redirect"]);
  });
});
