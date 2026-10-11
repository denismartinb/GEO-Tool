/**
 * ADMIN-PANEL-1 — where a visit came from.
 *
 * PostHog gives us, per session, its first `utm_source` or else its referring
 * domain (`$direct` when there is none). This module folds those raw values
 * into the handful of channels the panel shows. Pure, so the mapping is
 * tested and not re-guessed on the screen.
 *
 * The browser SDK runs cookieless, so a "session" here is closer to one page
 * load than to one person. The panel calls it «visitas», never «usuarios».
 */

export type ChannelId = "linkedin" | "email" | "search" | "ai" | "x" | "direct" | "other";

export const CHANNEL_LABELS: Record<ChannelId, string> = {
  linkedin: "LinkedIn",
  email: "Email",
  search: "Buscadores",
  ai: "Asistentes de IA",
  x: "X",
  direct: "Directo",
  other: "Otros"
};

/** Our own host as a referrer is navigation inside the site, i.e. direct. */
const OWN_HOSTS = ["genscore.es", "www.genscore.es"];

const AI_HOSTS = ["chatgpt.com", "chat.openai.com", "perplexity.ai", "gemini.google.com", "claude.ai", "copilot.microsoft.com"];
const SEARCH_HOSTS = ["google.", "bing.com", "duckduckgo.com", "ecosia.org", "search.yahoo.", "search.brave.com", "qwant.com"];

function hostMatches(host: string, needle: string): boolean {
  if (needle.endsWith(".")) {
    // "google." matches google.com, www.google.es, ...
    return host === needle.slice(0, -1) || host.startsWith(needle) || host.includes(`.${needle}`);
  }
  return host === needle || host.endsWith(`.${needle}`);
}

export function classifySource(raw: string | null | undefined): ChannelId {
  const source = (raw ?? "").trim().toLowerCase();
  if (!source || source === "$direct") return "direct";
  if (OWN_HOSTS.includes(source)) return "direct";

  // utm_source values we use in outreach (memory rule: utm_source=email/linkedin/x).
  if (source === "linkedin" || source.includes("linkedin") || source === "lnkd.in") return "linkedin";
  if (source === "email" || source === "newsletter" || source.startsWith("mail.") || source.includes("gmail")) return "email";
  if (source === "x" || source === "twitter" || source === "t.co" || hostMatches(source, "x.com") || hostMatches(source, "twitter.com")) {
    return "x";
  }
  if (source === "chatgpt" || source === "perplexity" || AI_HOSTS.some((h) => hostMatches(source, h))) return "ai";
  if (source === "google" || SEARCH_HOSTS.some((h) => hostMatches(source, h))) return "search";
  return "other";
}

export type ChannelRow = { id: ChannelId; label: string; visits: number; share: number };

export function groupChannels(rows: Array<{ source: string | null; visits: number }>): ChannelRow[] {
  const totals = new Map<ChannelId, number>();
  let all = 0;
  for (const row of rows) {
    const visits = Number.isFinite(row.visits) ? row.visits : 0;
    if (visits <= 0) continue;
    const id = classifySource(row.source);
    totals.set(id, (totals.get(id) ?? 0) + visits);
    all += visits;
  }
  return [...totals.entries()]
    .map(([id, visits]) => ({ id, label: CHANNEL_LABELS[id], visits, share: all > 0 ? visits / all : 0 }))
    .sort((a, b) => b.visits - a.visits || a.label.localeCompare(b.label));
}
