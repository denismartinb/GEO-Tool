import "server-only";

import { AUDIT_USER_AGENT, readBodyCapped } from "@/lib/web-audit/fetch-page";
import { parseSitemap, type SitemapReport } from "@/lib/web-audit/sitemap";

/**
 * robots.txt / llms.txt access report for the AI bots that matter (WEB-AUDIT-2).
 * A deterministic, simplified subset of robots.txt semantics — exact-token
 * user-agent groups beat the `*` fallback, and only the root-disallow case
 * (`Disallow: /`) counts as "blocked". Path-level nuance is explicitly out of
 * scope: guessing at partial-path semantics would be worse than not checking
 * at all.
 */

export const TRACKED_BOT_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "Google-Extended",
  "PerplexityBot",
  "ClaudeBot",
  "anthropic-ai",
  "Bingbot"
] as const;

export type BotAgent = (typeof TRACKED_BOT_AGENTS)[number];

export type BotAccessEntry = { agent: BotAgent; allowed: boolean };

export type BotAccessReport = {
  robotsFound: boolean;
  bots: BotAccessEntry[];
  llmsTxtFound: boolean;
  llmsTxtBytes: number | null;
  /**
   * WEB-AUDIT-R3: whether /sitemap.xml is REACHABLE. Kept exactly as it was —
   * `sitemap_missing` still keys off this, and every snapshot taken before
   * WEB-AUDIT-SITEMAP-1 has only this field.
   *
   * Note it stays `true` for a soft 404 (an HTML error page served with 200),
   * because reachability is all it ever meant. `sitemap` below is what
   * distinguishes a real sitemap from one.
   */
  sitemapFound: boolean;
  /**
   * WEB-AUDIT-SITEMAP-1: what the already-downloaded bytes actually contained.
   * Optional on purpose — a snapshot persisted before this phase has no such
   * field, and the UI must degrade to the old presence-only reading instead of
   * inventing a state for it.
   */
  sitemap?: SitemapReport | null;
  /**
   * Whether each probe actually got an answer. Optional: a snapshot taken
   * before this existed has only the booleans above, and must keep reading
   * exactly as it did — inventing a state for an audit that never measured it
   * is the retroactive-measurement trap.
   *
   * The booleans stay as they were (`found === true` only), so nothing that
   * reads them changes meaning. What changes is that `false` no longer has to
   * carry two incompatible meanings on its own.
   */
  probes?: { robots: ProbeState; llmsTxt: ProbeState; sitemap: ProbeState };
};

type RawGroup = { agents: string[]; disallows: string[] };

/**
 * Groups `User-agent:` blocks: consecutive User-agent lines belong to the
 * same group; the first non-User-agent directive (Disallow, Allow, etc.)
 * closes the agent-listing part of the block, so a LATER User-agent line
 * starts a brand new group — the standard robots.txt grouping convention.
 */
function parseGroups(content: string): RawGroup[] {
  const groups: RawGroup[] = [];
  let current: RawGroup | null = null;
  let inAgentBlock = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const field = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (field === "user-agent") {
      if (!inAgentBlock) {
        current = { agents: [], disallows: [] };
        groups.push(current);
      }
      current!.agents.push(value.toLowerCase());
      inAgentBlock = true;
    } else if (field === "disallow") {
      inAgentBlock = false;
      if (current) current.disallows.push(value);
    } else {
      inAgentBlock = false; // allow / crawl-delay / sitemap / anything else — ends the agent block
    }
  }
  return groups;
}

/** Pure parser: exact-token group beats `*`; `Disallow: /` is the only blocking rule this phase checks. */
export function resolveBotAccess(content: string): Map<BotAgent, boolean> {
  const groups = parseGroups(content);
  const result = new Map<BotAgent, boolean>();

  for (const agent of TRACKED_BOT_AGENTS) {
    const token = agent.toLowerCase();
    const exactGroup = groups.find((g) => g.agents.includes(token));
    const wildcardGroup = groups.find((g) => g.agents.includes("*"));
    const group = exactGroup ?? wildcardGroup;
    const blocked = group ? group.disallows.some((d) => d.trim() === "/") : false;
    result.set(agent, !blocked);
  }
  return result;
}

const TXT_FETCH_TIMEOUT_MS = 4_000;
const TXT_MAX_BYTES = 128 * 1024;

/**
 * Whether a well-known file is there — and, crucially, whether we could tell.
 *
 * `absent` and `unknown` used to be the same thing: `fetchTextCapped` returned
 * null for a 404, a 403, a timeout and a DNS failure alike, and every one of
 * them surfaced as "No encontrado". Found live on 2026-08-04 against
 * mozilla.org, which reported no sitemap — a site that certainly has one.
 *
 * That conflation was tolerable while the audit only *reported* the fact. It
 * stopped being tolerable now that we act on it: a customer behind a WAF that
 * refuses an unknown user-agent would be told a file is missing and handed
 * step-by-step instructions to create one that already exists. Telling someone
 * to fix a problem they do not have is worse than saying nothing.
 *
 * It is the same class of bug as the soft 404 this phase already fixed, in the
 * opposite direction: a check that collapses distinct states into one answer.
 */
export type ProbeState =
  /** 2xx with a body we read. */
  | "found"
  /** The server answered, clearly, that there is nothing there (404/410). */
  | "absent"
  /** We could not find out: blocked (401/403), server error, timeout, network failure. */
  | "unknown";

type ProbeResult = { state: ProbeState; content: string | null };

async function fetchTextCapped(url: string): Promise<ProbeResult> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TXT_FETCH_TIMEOUT_MS),
      headers: { "user-agent": AUDIT_USER_AGENT }
    });

    if (response.ok) {
      return { state: "found", content: await readBodyCapped(response, TXT_MAX_BYTES) };
    }
    // Only an explicit "there is nothing here" counts as absent. Everything
    // else — 403 from a WAF, 500, 429 — means we did not get to look.
    if (response.status === 404 || response.status === 410) {
      return { state: "absent", content: null };
    }
    return { state: "unknown", content: null };
  } catch {
    // Timeout, DNS failure, TLS error, connection reset. None of these are
    // evidence about the file.
    return { state: "unknown", content: null };
  }
}

/**
 * Fetches robots.txt and llms.txt for a domain and builds the access report.
 * Missing/unreachable robots.txt is the crawl-default: every tracked bot is
 * `allowed`, recorded via `robotsFound: false` (not silently indistinguishable
 * from an explicit "allow everything" robots.txt).
 */
export async function buildBotAccessReport(domain: string): Promise<BotAccessReport> {
  const robotsProbe = await fetchTextCapped(`https://${domain}/robots.txt`);
  const robotsFound = robotsProbe.content !== null;
  const accessMap = robotsProbe.content !== null
    ? resolveBotAccess(robotsProbe.content)
    : new Map(TRACKED_BOT_AGENTS.map((agent) => [agent, true] as const));
  const bots: BotAccessEntry[] = TRACKED_BOT_AGENTS.map((agent) => ({
    agent,
    allowed: accessMap.get(agent) ?? true
  }));

  const llmsProbe = await fetchTextCapped(`https://${domain}/llms.txt`);
  const sitemapProbe = await fetchTextCapped(`https://${domain}/sitemap.xml`);

  return {
    robotsFound,
    bots,
    llmsTxtFound: llmsProbe.content !== null,
    llmsTxtBytes: llmsProbe.content !== null ? Buffer.byteLength(llmsProbe.content, "utf-8") : null,
    sitemapFound: sitemapProbe.content !== null,
    // Zero extra network cost: these are the very bytes fetched on the line
    // above, which used to be discarded after the null check.
    sitemap: parseSitemap(sitemapProbe.content),
    probes: { robots: robotsProbe.state, llmsTxt: llmsProbe.state, sitemap: sitemapProbe.state }
  };
}
