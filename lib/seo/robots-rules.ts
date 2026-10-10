/** Private surfaces no crawler has any business in. Shared by every rule below. */
export const DISALLOWED_PATHS = ["/dashboard", "/api", "/auth", "/admin", "/mfa", "/informe"];

/**
 * AI crawlers named explicitly (GEO-SELF-1 Fase 1). The `*` rule already lets
 * them in, so this changes nothing for a parser that follows the spec — but a
 * crawler that finds its own user-agent named with `Allow: /` gets an
 * unambiguous signal, and some operators read the file looking for exactly
 * that. A product that sells "make AI engines cite you" cannot leave its own
 * robots.txt ambiguous about them.
 *
 * Each named group repeats the full disallow list on purpose: per RFC 9309 a
 * crawler that matches a named group IGNORES the `*` group entirely, so a
 * named group with only `allow: "/"` would open `/dashboard` and `/api` to it.
 */
export const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Google-Extended",
  "Bingbot",
  "Applebot-Extended"
] as const;
