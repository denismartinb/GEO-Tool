/**
 * AI-BOTS-CONSOLE-1 (log §426): the AI bots of robots.txt the way the
 * WordPress plugin shows them (`docs/wordpress-plugin/genscore/includes/robots.php`):
 * six switches, one per engine and use (search or training), and per engine
 * whether it can read the site.
 *
 * Pure and client-safe: the audit (`robots.ts`, server-only) stores what each
 * token may do and the `*` group's rules; this module only reads that.
 *
 * «Can read» follows the same rule as the plugin, the Chrome extension and the
 * agentic audit (`lib/agentic-audit/agents.ts`): every SEARCH token of the
 * engine has to be allowed. A training token never decides it, so closing
 * GPTBot or ClaudeBot is the owner's call and never a problem.
 */

export type AiEngine = "chatgpt" | "gemini" | "claude" | "perplexity";

/** Who runs a switch: one of the engines we measure, or Meta (Meta AI and its agent Muse, log §427). */
export type AiBotVendor = AiEngine | "meta";

export type AiBotSwitch = {
  id: string;
  engine: AiBotVendor;
  kind: "search" | "training";
  /** What the switch controls, after «Engine ·». */
  what: string;
  tokens: string[];
};

/** Same ids, tokens and order as `genscore_bot_switches()` in the plugin. */
export const AI_BOT_SWITCHES: AiBotSwitch[] = [
  { id: "chatgpt-search", engine: "chatgpt", kind: "search", what: "Búsqueda y enlaces que abre ChatGPT", tokens: ["OAI-SearchBot", "ChatGPT-User"] },
  { id: "chatgpt-training", engine: "chatgpt", kind: "training", what: "Entrenamiento de modelos", tokens: ["GPTBot"] },
  { id: "claude-search", engine: "claude", kind: "search", what: "Búsqueda y enlaces que abre Claude", tokens: ["Claude-SearchBot", "Claude-User"] },
  { id: "claude-training", engine: "claude", kind: "training", what: "Entrenamiento de modelos", tokens: ["ClaudeBot"] },
  { id: "perplexity-search", engine: "perplexity", kind: "search", what: "Búsqueda y enlaces que abre Perplexity", tokens: ["PerplexityBot", "Perplexity-User"] },
  { id: "gemini", engine: "gemini", kind: "search", what: "Respuestas y entrenamiento de Gemini", tokens: ["Google-Extended"] },
  // Log §427: Meta publishes these two (developers.facebook.com, web crawlers).
  // `meta-externalfetcher` is left out on purpose: Meta says it may bypass robots.txt.
  { id: "meta-search", engine: "meta", kind: "search", what: "Búsqueda de Meta AI y Muse", tokens: ["meta-webindexer"] },
  { id: "meta-training", engine: "meta", kind: "training", what: "Entrenamiento de modelos", tokens: ["meta-externalagent"] }
];

/** Switches the WordPress plugin does not have yet (it gets them in its next version, log §427). */
export const PLUGIN_PENDING_SWITCHES = new Set(["meta-search", "meta-training"]);

export const AI_ENGINES: { engine: AiEngine; name: string }[] = [
  { engine: "chatgpt", name: "ChatGPT" },
  { engine: "gemini", name: "Gemini" },
  { engine: "claude", name: "Claude" },
  { engine: "perplexity", name: "Perplexity" }
];

/**
 * The tokens that decide whether an engine can read the site. Gemini also
 * needs Googlebot, which the plugin never touches (it is Google search), so it
 * is not a switch here either.
 */
export const ENGINE_READ_TOKENS: Record<AiEngine, string[]> = {
  chatgpt: ["OAI-SearchBot", "ChatGPT-User"],
  gemini: ["Googlebot", "Google-Extended"],
  claude: ["Claude-SearchBot", "Claude-User"],
  perplexity: ["PerplexityBot", "Perplexity-User"]
};

/** Every token the audit records for this card. */
export const AI_BOT_TOKENS: string[] = Array.from(
  new Set([...AI_BOT_SWITCHES.flatMap((s) => s.tokens), ...Object.values(ENGINE_READ_TOKENS).flat()])
);

/** Tokens that only feed model training: never a reason to say a site cannot be read. */
export const TRAINING_ONLY_TOKENS = new Set(["GPTBot", "ClaudeBot", "anthropic-ai", "meta-externalagent"]);

/** What the audit stored about these bots (`BotAccessReport.aiBots`). */
export type AiBotsFacts = {
  /** Token → may read the site root. */
  tokens: Record<string, boolean>;
  /** The `*` group's rules, minus a blanket `Allow: /` or `Disallow: /`. */
  starRules: string[];
};

/** The slice of `BotAccessReport` this module reads (kept structural so it stays client-safe). */
export type AiBotsInput = {
  robotsFound?: boolean;
  bots?: { agent: string; allowed: boolean }[];
  probes?: { robots?: string };
  site?: { googlebotAllowed?: boolean };
  aiBots?: AiBotsFacts;
} | null | undefined;

/**
 * Token → allowed, or undefined when it was never measured. A snapshot taken
 * before this phase only has the old token list (`bots`) and Googlebot; the
 * rest stays unmeasured, never assumed. A robots.txt we could not read says
 * nothing at all.
 */
export function aiTokenStates(report: AiBotsInput): (token: string) => boolean | undefined {
  if (!report || report.probes?.robots === "unknown") return () => undefined;
  const stored = report.aiBots?.tokens;
  const legacy = new Map((Array.isArray(report.bots) ? report.bots : []).map((b) => [b.agent, b.allowed]));
  return (token) => {
    if (stored && token in stored) return stored[token];
    if (token === "Googlebot" && report.site?.googlebotAllowed !== undefined) return report.site.googlebotAllowed;
    return legacy.get(token);
  };
}

/**
 * Whether each engine can read the site: false if any of its read tokens is
 * blocked, true if every measured one is allowed (at least one measured), null
 * when none was measured.
 */
export function engineReadStates(report: AiBotsInput): Record<AiEngine, boolean | null> {
  const state = aiTokenStates(report);
  const out = {} as Record<AiEngine, boolean | null>;
  for (const { engine } of AI_ENGINES) {
    const values = ENGINE_READ_TOKENS[engine].map(state).filter((v): v is boolean => v !== undefined);
    out[engine] = values.length === 0 ? null : values.every(Boolean);
  }
  return out;
}

/** Each switch: open (every token allowed), closed (any blocked) or null (unmeasured). */
export function switchStates(report: AiBotsInput): Record<string, boolean | null> {
  const state = aiTokenStates(report);
  const out: Record<string, boolean | null> = {};
  for (const sw of AI_BOT_SWITCHES) {
    const values = sw.tokens.map(state);
    out[sw.id] = values.some((v) => v === false) ? false : values.every((v) => v === true) ? true : null;
  }
  return out;
}

export function engineLabel(engine: AiBotVendor): string {
  if (engine === "meta") return "Meta";
  return AI_ENGINES.find((e) => e.engine === engine)!.name;
}

/**
 * The `*` group's Allow/Disallow lines, minus a blanket `/` (same as
 * `genscore_star_rules()` in the plugin). A named group makes a crawler ignore
 * `*` entirely (RFC 9309), so an «Allow» group has to repeat these or it would
 * open private paths to that bot.
 */
export function starGroupRules(content: string): string[] {
  const rules: string[] = [];
  let inStar = false;
  let agentRun = false;
  for (const raw of content.split(/\r\n|\n|\r/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      if (!agentRun) inStar = false;
      if (value === "*") inStar = true;
      agentRun = true;
      continue;
    }
    agentRun = false;
    if (!inStar || (field !== "allow" && field !== "disallow")) continue;
    if (value === "" || value === "/") continue;
    const rule = `${field === "allow" ? "Allow" : "Disallow"}: ${value}`;
    if (!rules.includes(rule)) rules.push(rule);
  }
  return rules;
}

/**
 * The block to paste into robots.txt for the wanted switches. Every switch
 * gets its own group: open repeats the `*` rules, closed is `Disallow: /`.
 * Nothing here touches `*`, Googlebot or Bingbot.
 */
export function buildAiBotsRobotsBlock(want: Record<string, boolean>, starRules: string[]): string {
  const lines = ["# Bots de IA (GenScore)"];
  for (const sw of AI_BOT_SWITCHES) {
    for (const token of sw.tokens) lines.push(`User-agent: ${token}`);
    if (want[sw.id]) lines.push("Allow: /", ...starRules);
    else lines.push("Disallow: /");
    lines.push("");
  }
  lines.pop();
  return lines.join("\n");
}
