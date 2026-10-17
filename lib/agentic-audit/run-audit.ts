import { resolveAssistantAccess } from "@/lib/agentic-audit/agents";
import type { AgenticCheckError, AgenticCheckResult, AgenticProductFound } from "@/lib/agentic-audit/api-contract";
import { isChallengeResponse } from "@/lib/agentic-audit/challenge";
import { findProductCandidate } from "@/lib/agentic-audit/find-product";
import { extractPageSignals, isProductPage, type PageSignals } from "@/lib/agentic-audit/html-signals";
import { extractPageFacts } from "@/lib/agentic-audit/page-facts";
import { buildInterop, interopProbePaths, type Probe } from "@/lib/agentic-audit/interop";
import { scoreAgenticAudit } from "@/lib/agentic-audit/score";
import { cleanDomain, isWellFormedDomain } from "@/lib/projects/project-form";

/**
 * AGENTIC-COMMERCE-1: runs the free agentic check on one URL.
 *
 * What it requests is a fixed list, all on the store's own domain: the page
 * the visitor gave, robots.txt, sitemap.xml, four well-known files and, on
 * Shopify or WooCommerce, the public catalogue endpoint. No link is
 * followed and no URL is discovered, so this is not a crawler
 * (`.claude/rules/web-audit.md`, «Antes de ampliar»). No LLM is called.
 *
 * With `discover` (the console only, log §323) one more page may be
 * requested: when the page read is not a product page, `findProductCandidate`
 * picks one product page from the bytes above (catalogue, sitemap, the page
 * itself) and that single page is fetched. If it is not a product page
 * either, no other is tried and the result stays on the first page with
 * `found: "none"`.
 *
 * The fetcher and the robots parser are injected so the whole flow runs in
 * Vitest without network; the route wires the real ones.
 */

type FetchResponse = {
  kind: "response";
  status: number;
  finalUrl: string;
  headers: Record<string, string | undefined>;
  body: string;
  ms: number;
};
type FetchError = { kind: "error"; reason: string };
export type AgenticFetcher = (
  url: string,
  baseDomain: string,
  options: { timeoutMs: number; maxBytes: number; deadlineAt?: number }
) => Promise<FetchResponse | FetchError>;

export type RunAgenticAuditDeps = {
  fetch: AgenticFetcher;
  tokenAllowed: (robots: string, token: string) => boolean;
  now?: () => number;
};

export const AGENTIC_AUDIT_BUDGET_MS = 20_000;
/** Console budget: the free checker's three rounds plus the one product page. */
export const AGENTIC_DISCOVER_BUDGET_MS = 24_000;
/** Below this, the product page is not requested: it would not have time to load. */
const MIN_PRODUCT_FETCH_MS = 3_000;
const PAGE_TIMEOUT_MS = 8_000;
const SMALL_TIMEOUT_MS = 5_000;
const PAGE_MAX_BYTES = 1024 * 1024;
const SMALL_MAX_BYTES = 128 * 1024;

export type NormalizedTarget = { url: string; host: string; baseDomain: string };

/** Accepts «tienda.es», «www.tienda.es/x» or a full https URL. Anything else is `null`. */
export function normalizeTarget(input: string): NormalizedTarget | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (parsed.username || parsed.password) return null;
  if (parsed.port && parsed.port !== "443" && parsed.port !== "80") return null;
  const host = parsed.hostname.toLowerCase();
  // IP literals are refused here as well as in the fetcher: the TLD must be letters.
  if (!isWellFormedDomain(host) || !/\.[a-z]{2,}$/.test(host)) return null;
  parsed.protocol = "https:";
  parsed.port = "";
  parsed.hash = "";
  return { url: parsed.toString(), host, baseDomain: cleanDomain(host) };
}

function toProbe(result: FetchResponse | FetchError): Probe {
  if (result.kind === "error") return { state: "unknown", body: null };
  if (result.status >= 200 && result.status < 300) return { state: "found", body: result.body };
  if (result.status === 404 || result.status === 410) return { state: "absent", body: null };
  return { state: "unknown", body: null };
}

function sitemapState(result: FetchResponse | FetchError): "found" | "absent" | "unknown" {
  if (result.kind === "error") return "unknown";
  if (result.status >= 200 && result.status < 300) {
    // A soft 404 (an HTML page served with 200) is not a sitemap.
    return /<(?:urlset|sitemapindex)\b/i.test(result.body) ? "found" : "absent";
  }
  if (result.status === 404 || result.status === 410) return "absent";
  return "unknown";
}

export type RunAgenticAuditOutcome =
  | { status: "completed"; result: AgenticCheckResult }
  | { status: "failed"; error: AgenticCheckError };

export type RunAgenticAuditOptions = {
  discover?: boolean;
  /** Overrides the budget, for a caller that splits one budget across two runs. */
  budgetMs?: number;
};

function isReadableHtml(page: FetchResponse): boolean {
  const isHtml = (page.headers["content-type"] ?? "").toLowerCase().includes("html");
  return page.status >= 200 && page.status < 300 && isHtml;
}

export async function runAgenticAudit(
  input: string,
  deps: RunAgenticAuditDeps,
  options: RunAgenticAuditOptions = {}
): Promise<RunAgenticAuditOutcome> {
  const target = normalizeTarget(input);
  if (!target) return { status: "failed", error: "invalid_url" };

  const now = deps.now ?? Date.now;
  const deadlineAt =
    now() + (options.budgetMs ?? (options.discover ? AGENTIC_DISCOVER_BUDGET_MS : AGENTIC_AUDIT_BUDGET_MS));
  const origin = `https://${target.host}`;
  const small = { timeoutMs: SMALL_TIMEOUT_MS, maxBytes: SMALL_MAX_BYTES, deadlineAt };
  const paths = interopProbePaths(null);

  const [page, robots, sitemap, ucp, mcpCard, agentCard, agentCardLegacy] = await Promise.all([
    deps.fetch(target.url, target.baseDomain, { timeoutMs: PAGE_TIMEOUT_MS, maxBytes: PAGE_MAX_BYTES, deadlineAt }),
    deps.fetch(`${origin}/robots.txt`, target.baseDomain, small),
    deps.fetch(`${origin}/sitemap.xml`, target.baseDomain, { ...small, maxBytes: 16 * 1024 }),
    deps.fetch(`${origin}${paths.ucp}`, target.baseDomain, small),
    deps.fetch(`${origin}${paths.mcpCard}`, target.baseDomain, small),
    deps.fetch(`${origin}${paths.agentCard}`, target.baseDomain, small),
    deps.fetch(`${origin}${paths.agentCardLegacy}`, target.baseDomain, small)
  ]);

  if (page.kind === "error") return { status: "failed", error: "site_unreachable" };

  const challenge = isChallengeResponse(page);
  let signals: PageSignals | null = null;
  let facts = null;
  if (!challenge) {
    if (!isReadableHtml(page)) return { status: "failed", error: "site_unreachable" };
    signals = extractPageSignals(page.body);
    facts = extractPageFacts(page.body);
  }

  const platform = signals?.platform ?? null;
  const feedPath = interopProbePaths(platform).feed;
  const feedResponse = feedPath ? await deps.fetch(`${origin}${feedPath}`, target.baseDomain, small) : null;
  const feed = feedResponse ? toProbe(feedResponse) : null;

  let pageUrl = page.finalUrl;
  let found: AgenticProductFound | undefined;
  if (options.discover && signals) {
    found = isProductPage(signals) ? "given" : "none";
    const candidate =
      found === "none"
        ? findProductCandidate({
            origin,
            baseDomain: target.baseDomain,
            currentUrl: page.finalUrl,
            feedBody: feed?.state === "found" ? feed.body : null,
            feedPlatform: platform,
            sitemapBody: sitemap.kind === "response" && sitemap.status >= 200 && sitemap.status < 300 ? sitemap.body : null,
            pageHtml: page.body
          })
        : null;
    if (candidate && deadlineAt - now() >= MIN_PRODUCT_FETCH_MS) {
      const product = await deps.fetch(candidate.url, target.baseDomain, {
        timeoutMs: PAGE_TIMEOUT_MS,
        maxBytes: PAGE_MAX_BYTES,
        deadlineAt
      });
      if (product.kind === "response" && !isChallengeResponse(product) && isReadableHtml(product)) {
        const productSignals = extractPageSignals(product.body);
        // Only one try: a candidate that is not a product page leaves the first page in place.
        if (isProductPage(productSignals)) {
          signals = productSignals;
          facts = extractPageFacts(product.body);
          pageUrl = product.finalUrl;
          found = candidate.source;
        }
      }
    }
  }

  const robotsText =
    robots.kind === "response" && robots.status >= 200 && robots.status < 300
      ? robots.body
      : robots.kind === "response" && (robots.status === 404 || robots.status === 410)
        ? null
        : undefined;

  const result = scoreAgenticAudit({
    domain: target.baseDomain,
    url: pageUrl,
    signals,
    agents: resolveAssistantAccess(robotsText, deps.tokenAllowed),
    challenge,
    facts,
    sitemap: sitemapState(sitemap),
    interop: buildInterop({
      ucp: toProbe(ucp),
      mcpCard: toProbe(mcpCard),
      agentCard: toProbe(agentCard),
      agentCardLegacy: toProbe(agentCardLegacy),
      feed,
      feedPlatform: platform
    })
  });

  return { status: "completed", result: found ? { ...result, found } : result };
}
