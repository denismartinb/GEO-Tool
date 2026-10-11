import type { PageCheckResult } from "@/lib/web-audit/page-checks";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import type { BotAccessReport } from "@/lib/web-audit/robots";
import type { IssueSeverity, TechnicalIssue, TechnicalPassingCheck } from "@/lib/web-audit/issues";

/**
 * Salud SEO (SEARCH-SEO-1 Fase 2, log §281, design in
 * `docs/design-reference/search-seo-1/salud-seo.html`): the checks that only
 * the «Auditoría SEO» block scores. Pure, like `issues.ts`.
 *
 * Founder decision (2026-10-11): these checks and the home page speed count
 * ONLY in the Salud SEO. They never enter `pageScore` or `readiness_score`,
 * so the GEO Score does not move when they ship. That is why they live here
 * and not in `page-checks.ts`'s point table.
 *
 * Every new field is optional and tri-state: `undefined` means «never
 * measured» (an old snapshot, no PageSpeed key) and is left out of both the
 * issues and the passing list, and out of the score.
 */

export type SeoExtraCheckKey =
  | "page_speed"
  | "googlebot_blocked"
  | "https_redirect"
  | "viewport_missing"
  | "image_alt_missing"
  | "duplicate_metadata"
  | "local_business_missing";

/**
 * Points out of 100 in the Salud SEO, next to the 45 the eight existing SEO
 * checks already carry in `page-checks.ts`. Approved by the founder on
 * 2026-10-11. Null = reported without points (we cannot tell whether the
 * business serves customers at a physical location).
 */
export const SEO_EXTRA_WEIGHTS: Record<SeoExtraCheckKey, number | null> = {
  page_speed: 20,
  googlebot_blocked: 10,
  https_redirect: 10,
  viewport_missing: 5,
  image_alt_missing: 5,
  duplicate_metadata: 5,
  local_business_missing: null
};

// ---------------------------------------------------------------------------
// What the audit persists (inside `web_audit_snapshots.bots`, as `site`)
// ---------------------------------------------------------------------------

/** `unknown`: we could not find out (timeout, DNS, a redirect off the domain). Never scored. */
export type HttpsRedirectState = "ok" | "missing" | "unknown";

/**
 * One device's Core Web Vitals. `field` = real Chrome users over 28 days
 * (CrUX), `lab` = one Lighthouse run when the site has too little traffic
 * for field data. A lab run has no INP, so `inpMs` stays null there.
 */
export type DeviceSpeed = {
  source: "field" | "lab";
  lcpMs: number | null;
  inpMs: number | null;
  cls: number | null;
};

export type PageSpeedReport = {
  /** When Google measured it. Reused for up to `PAGESPEED_REFRESH_MS`. */
  measuredAt: string;
  /** Null when that strategy's call failed. */
  mobile: DeviceSpeed | null;
  desktop: DeviceSpeed | null;
};

export type SiteSeoReport = {
  /** Whether robots.txt lets Googlebot in. Undefined when robots.txt could not be read. */
  googlebotAllowed?: boolean;
  https?: HttpsRedirectState;
  /** Undefined = not measured (no `PAGESPEED_API_KEY`); null = the call failed. */
  pageSpeed?: PageSpeedReport | null;
};

/** Page speed changes when the site changes, not with every scan, and each call takes seconds. */
export const PAGESPEED_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

/** The previous report is reused when it measured mobile and is younger than a week. */
export function reusablePageSpeed(previous: PageSpeedReport | null | undefined, now: Date): PageSpeedReport | null {
  if (!previous?.mobile) return null;
  const age = now.getTime() - new Date(previous.measuredAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < PAGESPEED_REFRESH_MS ? previous : null;
}

// ---------------------------------------------------------------------------
// Core Web Vitals
// ---------------------------------------------------------------------------

export type VitalKey = "lcp" | "inp" | "cls";
export type VitalRating = "good" | "needs_improvement" | "poor";

/** Google's published thresholds (web.dev/vitals), inclusive at «good». */
export const VITAL_THRESHOLDS: Record<VitalKey, { good: number; poor: number }> = {
  lcp: { good: 2500, poor: 4000 },
  inp: { good: 200, poor: 500 },
  cls: { good: 0.1, poor: 0.25 }
};

export const VITAL_ORDER: VitalKey[] = ["lcp", "inp", "cls"];

export function rateVital(key: VitalKey, value: number): VitalRating {
  const { good, poor } = VITAL_THRESHOLDS[key];
  if (value <= good) return "good";
  if (value <= poor) return "needs_improvement";
  return "poor";
}

export function vitalValue(device: DeviceSpeed, key: VitalKey): number | null {
  if (key === "lcp") return device.lcpMs;
  if (key === "inp") return device.inpMs;
  return device.cls;
}

/** «3,4 s», «180 ms», «0,02»: Spanish decimals, the units Google uses. */
export function formatVital(key: VitalKey, value: number): string {
  if (key === "lcp") return `${(value / 1000).toFixed(1).replace(".", ",")} s`;
  if (key === "inp") return `${Math.round(value)} ms`;
  return value.toFixed(2).replace(".", ",");
}

const RATING_SHARE: Record<VitalRating, number> = { good: 1, needs_improvement: 0.5, poor: 0 };

/**
 * Share of the speed points a device earns: each measured vital is worth the
 * same, full for «good», half for «needs improvement», nothing for «poor».
 * Null when no vital was measured.
 */
export function speedShare(device: DeviceSpeed | null | undefined): number | null {
  if (!device) return null;
  const ratings = VITAL_ORDER.flatMap((key) => {
    const value = vitalValue(device, key);
    return value === null ? [] : [rateVital(key, value)];
  });
  if (ratings.length === 0) return null;
  return ratings.reduce((sum, r) => sum + RATING_SHARE[r], 0) / ratings.length;
}

/** The vital that most needs work: the worst rating, then LCP before INP before CLS. Null when all are good. */
export function worstVital(device: DeviceSpeed): { key: VitalKey; value: number; rating: VitalRating } | null {
  let worst: { key: VitalKey; value: number; rating: VitalRating } | null = null;
  for (const key of VITAL_ORDER) {
    const value = vitalValue(device, key);
    if (value === null) continue;
    const rating = rateVital(key, value);
    if (rating === "good") continue;
    if (!worst || (rating === "poor" && worst.rating !== "poor")) worst = { key, value, rating };
  }
  return worst;
}

/**
 * Reads one PageSpeed Insights v5 response. Real-user data when Google has
 * it for the URL, otherwise the Lighthouse lab run. Null when neither has a
 * usable number. Never throws on an unexpected shape.
 */
export function parsePageSpeedResponse(json: unknown): DeviceSpeed | null {
  const root = asRecord(json);
  if (!root) return null;

  const fieldMetrics = asRecord(asRecord(root.loadingExperience)?.metrics);
  if (fieldMetrics) {
    const lcpMs = percentile(fieldMetrics.LARGEST_CONTENTFUL_PAINT_MS);
    const inpMs = percentile(fieldMetrics.INTERACTION_TO_NEXT_PAINT);
    const clsRaw = percentile(fieldMetrics.CUMULATIVE_LAYOUT_SHIFT_SCORE);
    // CrUX reports CLS ×100 (a percentile of 5 means 0.05).
    const cls = clsRaw === null ? null : clsRaw / 100;
    if (lcpMs !== null || inpMs !== null || cls !== null) return { source: "field", lcpMs, inpMs, cls };
  }

  const audits = asRecord(asRecord(root.lighthouseResult)?.audits);
  if (audits) {
    const lcpMs = numericValue(audits["largest-contentful-paint"]);
    const cls = numericValue(audits["cumulative-layout-shift"]);
    if (lcpMs !== null || cls !== null) return { source: "lab", lcpMs, inpMs: null, cls };
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function percentile(metric: unknown): number | null {
  return finiteOrNull(asRecord(metric)?.percentile);
}

function numericValue(audit: unknown): number | null {
  return finiteOrNull(asRecord(audit)?.numericValue);
}

// ---------------------------------------------------------------------------
// The Salud SEO checks over a snapshot
// ---------------------------------------------------------------------------

/** One check's contribution to the SEO block, in the same shape as `pageCheckStates`. */
export type SeoExtraState = {
  check: SeoExtraCheckKey;
  fails: boolean;
  weight: number;
  earned: number;
  possible: number;
};

export type SeoExtras = {
  /**
   * Flat list over the analyzed pages. Page-level checks contribute once per
   * page that measured them; site-level checks (speed, Googlebot, HTTPS)
   * once per analyzed page, so Σearned / Σpossible stays the share of the
   * block's points across the pages, exactly as before.
   */
  states: SeoExtraState[];
  issues: TechnicalIssue[];
  passing: TechnicalPassingCheck[];
};

type AnalyzedPage = PageAuditEntry & { check: PageCheckResult };

function analyzedPages(pages: PageAuditEntry[]): AnalyzedPage[] {
  return pages.filter((p): p is AnalyzedPage => p.status === "analyzed" && p.check !== null);
}

function scored(check: SeoExtraCheckKey, fails: boolean, share = fails ? 0 : 1): SeoExtraState | null {
  const weight = SEO_EXTRA_WEIGHTS[check];
  if (weight === null) return null;
  return { check, fails, weight, earned: weight * share, possible: weight };
}

/**
 * The page-level Salud SEO states of one page: viewport and image alt text,
 * plus duplicate title/description when the caller knows (it needs the
 * other pages). Used for the Páginas tab and inside `buildSeoExtras`.
 */
export function seoPageExtraStates(check: PageCheckResult, options: { duplicate?: boolean } = {}): SeoExtraState[] {
  const seo = check.seo;
  if (!seo) return [];
  const states: Array<SeoExtraState | null> = [
    scored("viewport_missing", !seo.viewportOk),
    scored("image_alt_missing", seo.imagesMissingAlt > 0)
  ];
  if (options.duplicate !== undefined) states.push(scored("duplicate_metadata", options.duplicate));
  return states.filter((s): s is SeoExtraState => s !== null);
}

/**
 * URLs of analyzed pages whose title or meta description is the same as
 * another page's. Two entries of the same page (same final URL) or pages
 * that declare the same canonical are one page, not a duplicate. Null when
 * fewer than two pages measured it: there is nothing to compare.
 */
export function duplicateMetadataUrls(pages: PageAuditEntry[]): Set<string> | null {
  const measured = analyzedPages(pages).filter((p) => p.check.seo);
  if (measured.length < 2) return null;
  const identity = (p: AnalyzedPage) => p.check.indexability?.canonicalUrl ?? p.check.seo!.pageKey;
  const duplicates = new Set<string>();
  for (const field of ["titleKey", "descriptionKey"] as const) {
    const byKey = new Map<string, AnalyzedPage[]>();
    for (const page of measured) {
      const key = page.check.seo![field];
      if (!key) continue;
      byKey.set(key, [...(byKey.get(key) ?? []), page]);
    }
    for (const group of byKey.values()) {
      if (new Set(group.map(identity)).size < 2) continue;
      for (const page of group) duplicates.add(page.url);
    }
  }
  return duplicates;
}

/**
 * The site-level Salud SEO states (Googlebot, HTTPS, mobile speed), one copy
 * each. They weigh on every analyzed page, so the Páginas tab adds them to
 * each page's score and `buildSeoExtras` once per page.
 */
export function seoSiteStates(bots: BotAccessReport | null | undefined): SeoExtraState[] {
  const site = bots?.site;
  const states: Array<SeoExtraState | null> = [];
  if (site?.googlebotAllowed !== undefined) states.push(scored("googlebot_blocked", !site.googlebotAllowed));
  if (site?.https === "ok" || site?.https === "missing") states.push(scored("https_redirect", site.https === "missing"));
  const share = speedShare(site?.pageSpeed?.mobile ?? null);
  if (share !== null) states.push(scored("page_speed", share < 1, share));
  return states.filter((s): s is SeoExtraState => s !== null);
}

function pagesLabel(count: number): string {
  return `${count} ${count === 1 ? "página" : "páginas"}`;
}

export function buildSeoExtras(pages: PageAuditEntry[], bots: BotAccessReport | null | undefined): SeoExtras {
  const analyzed = analyzedPages(pages);
  const states: SeoExtraState[] = [];
  const issues: TechnicalIssue[] = [];
  const passing: TechnicalPassingCheck[] = [];
  if (analyzed.length === 0) return { states, issues, passing };

  const duplicates = duplicateMetadataUrls(pages);
  const measured = analyzed.filter((p) => p.check.seo);

  // Page-level checks.
  for (const page of measured) {
    states.push(...seoPageExtraStates(page.check, duplicates ? { duplicate: duplicates.has(page.url) } : {}));
  }
  if (measured.length > 0) {
    const noViewport = measured.filter((p) => !p.check.seo!.viewportOk);
    report("viewport_missing", "warning", noViewport.map((p) => p.url), measured.length);

    const missingAlt = measured.filter((p) => p.check.seo!.imagesMissingAlt > 0);
    report(
      "image_alt_missing",
      "warning",
      missingAlt.map((p) => {
        const n = p.check.seo!.imagesMissingAlt;
        return `${p.url} · ${n} ${n === 1 ? "imagen" : "imágenes"}`;
      }),
      measured.length
    );

    if (duplicates) {
      const dupPages = measured.filter((p) => duplicates.has(p.url));
      report("duplicate_metadata", "warning", dupPages.map((p) => p.url), measured.length, {
        fail: `${pagesLabel(dupPages.length)} con título o descripción repetidos`,
        pass: "Cada página tiene los suyos"
      });
    }

    const local = measured.some((p) => p.check.seo!.localBusiness);
    if (local) passing.push({ check: "local_business_missing", passedCount: 1, applicableCount: 1, scopeText: "Declarado" });
    else issues.push(issue("local_business_missing", "improvement", [], 1, 1, "No declarado"));
  }

  // Site-level checks, replicated once per analyzed page.
  const site = bots?.site;
  const siteStates = seoSiteStates(bots);
  for (let i = 0; i < analyzed.length; i += 1) states.push(...siteStates);

  if (site?.googlebotAllowed !== undefined) {
    const blocked = !site.googlebotAllowed;
    if (blocked) issues.push(issue("googlebot_blocked", "critical", ["Googlebot"], 1, 1, "robots.txt bloquea a Googlebot"));
    else passing.push({ check: "googlebot_blocked", passedCount: 1, applicableCount: 1, scopeText: "robots.txt no lo bloquea" });
  }

  if (site?.https === "ok" || site?.https === "missing") {
    const missing = site.https === "missing";
    if (missing) issues.push(issue("https_redirect", "critical", [], 1, 1, "http:// no redirige a https://"));
    else passing.push({ check: "https_redirect", passedCount: 1, applicableCount: 1, scopeText: "http:// redirige a https://" });
  }

  const mobile = site?.pageSpeed?.mobile ?? null;
  const share = speedShare(mobile);
  if (mobile && share !== null) {
    const worst = worstVital(mobile);
    if (worst) {
      const good = formatVital(worst.key, VITAL_THRESHOLDS[worst.key].good);
      issues.push(
        issue(
          "page_speed",
          worst.rating === "poor" ? "critical" : "warning",
          [],
          1,
          1,
          `${worst.key.toUpperCase()} de ${formatVital(worst.key, worst.value)} en móvil (bueno: ${good} o menos)`
        )
      );
    } else {
      passing.push({ check: "page_speed", passedCount: 1, applicableCount: 1, scopeText: "Rápida en móvil" });
    }
  }

  return { states, issues, passing };

  function report(
    check: SeoExtraCheckKey,
    severity: IssueSeverity,
    failing: string[],
    applicable: number,
    text?: { fail: string; pass: string }
  ) {
    const passed = applicable - failing.length;
    if (passed > 0) passing.push({ check, passedCount: passed, applicableCount: applicable, scopeText: text?.pass });
    if (failing.length > 0) issues.push(issue(check, severity, failing, failing.length, applicable, text?.fail));
  }
}

function issue(
  check: SeoExtraCheckKey,
  severity: IssueSeverity,
  affectedLabels: string[],
  affectedCount: number,
  applicableCount: number,
  scopeText?: string
): TechnicalIssue {
  // `pointDelta` is in readiness points, and these checks carry none there.
  // Their points are the Salud SEO's, which `buildAuditBlock` computes.
  return { check, severity, affectedCount, applicableCount, pointDelta: null, affectedLabels, ...(scopeText ? { scopeText } : {}) };
}
