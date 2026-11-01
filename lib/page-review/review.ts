import "server-only";
import { parseHTML } from "linkedom";
import { fetchOnDomain } from "@/lib/agentic-audit/fetch";
import { normalizeTarget } from "@/lib/agentic-audit/run-audit";
import makeCollectPageFacts from "./collect.cjs";
import scoreApi from "./score.cjs";

/**
 * MCP-SERVER-1 (log §418): the Chrome extension's page review, run on the
 * server for the MCP tool `revisar_pagina`.
 *
 * Same code as the extension, not a port: `collect.cjs` and `score.cjs` are
 * generated from the extension's files (`scripts/sync-page-review.mjs`) and
 * `sync.test.ts` fails when they drift. The difference is where it reads:
 * the extension reads the tab after its JavaScript ran; this reads the HTML
 * the site serves, through the agentic audit's SSRF-guarded fetch (same
 * domain only, every hop verified, GenScore's own user agent). One page,
 * never its links: at most `MAX_REQUESTS` requests per review, all on the
 * page's own origin (robots.txt, llms.txt, a sitemap, one or two candidate
 * pages when the page itself sells nothing). No LLM.
 */

export const MAX_REQUESTS = 12;
const REVIEW_BUDGET_MS = 20_000;
const PAGE_MAX_BYTES = 1_500_000;
const FILE_MAX_BYTES = 3_000_000;

export type PageReview = {
  url: string;
  host: string;
  title: string;
  score: ReturnType<typeof scoreApi.scorePage>;
};

export type PageReviewOutcome =
  | { kind: "ok"; review: PageReview }
  | { kind: "failed"; reason: "invalid_url" | "unreachable" | "blocked" | "not_html" };

type ReviewDeps = {
  fetch: typeof fetchOnDomain;
  now: () => number;
};

let layoutPatched = false;

/**
 * The extension skips paragraphs and buttons that have no box. linkedom has
 * no layout and answers 0×0 for everything, which would hide the whole page,
 * so on the server every element counts as visible. linkedom is only used
 * here, so the patch has no other reader.
 */
function patchLayout(window: { Element: { prototype: { getBoundingClientRect: unknown } } }) {
  if (layoutPatched) return;
  window.Element.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, top: 0, left: 0, right: 1, bottom: 1, width: 1, height: 1 };
  };
  layoutPatched = true;
}

const BLOCKED_STATUS = new Set([401, 403, 429, 503]);

export async function reviewPage(input: string, deps: Partial<ReviewDeps> = {}): Promise<PageReviewOutcome> {
  const doFetch = deps.fetch ?? fetchOnDomain;
  const now = deps.now ?? Date.now;
  const target = normalizeTarget(input);
  if (!target) return { kind: "failed", reason: "invalid_url" };

  const deadlineAt = now() + REVIEW_BUDGET_MS;
  const page = await doFetch(target.url, target.baseDomain, { timeoutMs: 8_000, maxBytes: PAGE_MAX_BYTES, deadlineAt });
  if (page.kind === "error") return { kind: "failed", reason: "unreachable" };
  if (BLOCKED_STATUS.has(page.status) || page.headers["cf-mitigated"]) return { kind: "failed", reason: "blocked" };
  if (page.status < 200 || page.status >= 300) return { kind: "failed", reason: "unreachable" };
  if (!/html/i.test(page.headers["content-type"] ?? "") && !/^\s*<(!doctype|html)/i.test(page.body)) {
    return { kind: "failed", reason: "not_html" };
  }

  const location = new URL(page.finalUrl);
  const { window, document, DOMParser, Node } = parseHTML(page.body) as unknown as {
    window: { Element: { prototype: { getBoundingClientRect: unknown } } };
    document: unknown;
    DOMParser: unknown;
    Node: unknown;
  };
  patchLayout(window);

  let requests = 1;
  const sameOriginFetch = async (path: string, opts: { method?: string } = {}) => {
    const url = new URL(path, location);
    if (url.origin !== location.origin) throw new Error("offsite");
    const headersOf = (h: Record<string, string | undefined>) =>
      new Headers(Object.entries(h).filter((e): e is [string, string] => typeof e[1] === "string"));
    // The page itself was already read: a HEAD for its X-Robots-Tag reuses it.
    if (opts.method === "HEAD" && url.href === location.href) {
      return { status: page.status, headers: headersOf(page.headers), text: async () => "" };
    }
    if (requests >= MAX_REQUESTS) throw new Error("request_budget");
    requests += 1;
    const res = await doFetch(url.href, target.baseDomain, { timeoutMs: 6_000, maxBytes: FILE_MAX_BYTES, deadlineAt });
    if (res.kind === "error") throw new Error(res.reason);
    return { status: res.status, headers: headersOf(res.headers), text: async () => (opts.method === "HEAD" ? "" : res.body) };
  };

  try {
    const collect = makeCollectPageFacts(document, location, sameOriginFetch, { now: () => now() }, DOMParser, Node);
    const facts = await collect();
    return {
      kind: "ok",
      review: { url: facts.url, host: facts.host, title: facts.title, score: scoreApi.scorePage(facts, now()) }
    };
  } catch {
    return { kind: "failed", reason: "unreachable" };
  }
}
