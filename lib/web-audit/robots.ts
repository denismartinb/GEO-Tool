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

async function fetchTextCapped(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TXT_FETCH_TIMEOUT_MS),
      headers: { "user-agent": AUDIT_USER_AGENT }
    });
    if (!response.ok) return null;
    return await readBodyCapped(response, TXT_MAX_BYTES);
  } catch {
    return null;
  }
}

/**
 * Fetches robots.txt and llms.txt for a domain and builds the access report.
 * Missing/unreachable robots.txt is the crawl-default: every tracked bot is
 * `allowed`, recorded via `robotsFound: false` (not silently indistinguishable
 * from an explicit "allow everything" robots.txt).
 */
export async function buildBotAccessReport(domain: string): Promise<BotAccessReport> {
  const robotsContent = await fetchTextCapped(`https://${domain}/robots.txt`);
  const robotsFound = robotsContent !== null;
  const accessMap = robotsFound
    ? resolveBotAccess(robotsContent)
    : new Map(TRACKED_BOT_AGENTS.map((agent) => [agent, true] as const));
  const bots: BotAccessEntry[] = TRACKED_BOT_AGENTS.map((agent) => ({
    agent,
    allowed: accessMap.get(agent) ?? true
  }));

  const llmsContent = await fetchTextCapped(`https://${domain}/llms.txt`);
  const sitemapContent = await fetchTextCapped(`https://${domain}/sitemap.xml`);

  return {
    robotsFound,
    bots,
    llmsTxtFound: llmsContent !== null,
    llmsTxtBytes: llmsContent !== null ? Buffer.byteLength(llmsContent, "utf-8") : null,
    sitemapFound: sitemapContent !== null,
    // Zero extra network cost: these are the very bytes fetched on the line
    // above, which used to be discarded after the null check.
    sitemap: parseSitemap(sitemapContent)
  };
}
