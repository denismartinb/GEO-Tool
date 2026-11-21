/**
 * GEO-ALERTS-1 (log §440): does the SERVER let the AI search bots in, beyond
 * what robots.txt says? A site can allow OAI-SearchBot in robots.txt and still
 * answer it with a 403 from Cloudflare or a firewall rule. robots.txt cannot
 * show that; only asking the server as that bot can.
 *
 * We ask from our own server with the bot's published user-agent, so the
 * answer is a SIMULATION: a firewall that checks the bot's IP ranges may treat
 * the real bot differently. Every surface that shows it says «Simulación».
 *
 * Pure and client-safe: `bot-probe.ts` (server-only) fetches, this module
 * classifies and reads what was stored.
 */
import type { AiEngine } from "@/lib/web-audit/ai-bots";

export type ServerProbeState = "allowed" | "blocked" | "unknown";

/** Engines we can probe with their own search bot. Gemini reads through Googlebot, which we never impersonate. */
export type ProbedEngine = Exclude<AiEngine, "gemini">;

export const PROBED_BOTS: { engine: ProbedEngine; token: string; userAgent: string }[] = [
  {
    engine: "chatgpt",
    token: "OAI-SearchBot",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.3; +https://openai.com/searchbot"
  },
  {
    engine: "claude",
    token: "Claude-SearchBot",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +Claude-SearchBot@anthropic.com)"
  },
  {
    engine: "perplexity",
    token: "PerplexityBot",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)"
  }
];

export type ServerProbeReport = {
  measuredAt: string;
  /** Whether the home page answered our own audit user-agent. Without it nothing can be compared. */
  baseline: "ok" | "unknown";
  engines: Partial<Record<ProbedEngine, { token: string; state: ServerProbeState; status: number | null }>>;
};

/**
 * Statuses that mean «you, specifically, are not welcome». 429 is left out on
 * purpose: rate limiting can be caused by our own requests and says nothing
 * about the bot.
 */
const REFUSAL_STATUSES = new Set([401, 403, 406, 451]);

/** One answer to the bot's user-agent, read against the baseline. */
export function classifyBotAnswer(input: {
  baselineOk: boolean;
  status: number | null;
  /** Cloudflare's `cf-mitigated` header: present when it served a challenge instead of the page. */
  challenged: boolean;
}): ServerProbeState {
  if (!input.baselineOk || input.status === null) return "unknown";
  if (input.challenged || REFUSAL_STATUSES.has(input.status)) return "blocked";
  if (input.status >= 200 && input.status < 300) return "allowed";
  return "unknown";
}

/** The slice of `BotAccessReport` this module reads. */
export type ServerProbeInput = { serverProbe?: ServerProbeReport } | null | undefined;

/** Engines whose search bot our probe saw refused, in `PROBED_BOTS` order. */
export function serverBlockedEngines(report: ServerProbeInput): ProbedEngine[] {
  const engines = report?.serverProbe?.baseline === "ok" ? report.serverProbe.engines : null;
  if (!engines) return [];
  return PROBED_BOTS.map((b) => b.engine).filter((e) => engines[e]?.state === "blocked");
}

/** The probed state of one engine, or null when this audit did not probe it. */
export function serverStateFor(report: ServerProbeInput, engine: AiEngine): ServerProbeState | null {
  if (engine === "gemini" || !report?.serverProbe) return null;
  if (report.serverProbe.baseline !== "ok") return "unknown";
  return report.serverProbe.engines[engine]?.state ?? null;
}

/** The bot token we used for an engine, for the copy («OAI-SearchBot»). */
export function probedToken(engine: ProbedEngine): string {
  return PROBED_BOTS.find((b) => b.engine === engine)!.token;
}
