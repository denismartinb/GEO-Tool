import type { AgentAccess, AssistantName } from "@/lib/agentic-audit/api-contract";

/**
 * AGENTIC-COMMERCE-1 — which robots.txt tokens decide whether each
 * assistant can reach a store. An assistant counts as let in only when
 * every one of its tokens is: blocking the search crawler keeps the store
 * out of the shortlist, blocking the user-action fetcher keeps the agent
 * out of the page.
 *
 * Training-only tokens (`GPTBot`, `ClaudeBot`, `anthropic-ai`) are left out
 * on purpose: blocking them is a legitimate choice that does not stop an
 * agent from buying, and counting them would punish it.
 *
 * Gemini answers from Google's index and Google documents `Google-Extended`
 * as the control for Gemini's use of a site, so both count.
 */
export const ASSISTANT_ROBOTS_TOKENS: Record<AssistantName, readonly string[]> = {
  ChatGPT: ["ChatGPT-User", "OAI-SearchBot"],
  Claude: ["Claude-User", "Claude-SearchBot"],
  Perplexity: ["Perplexity-User", "PerplexityBot"],
  Gemini: ["Googlebot", "Google-Extended"]
};

export const ASSISTANTS = Object.keys(ASSISTANT_ROBOTS_TOKENS) as AssistantName[];

/**
 * `robots` is the file's text, `null` when there is none (404/410: every
 * crawler may enter), or `undefined` when we could not read it.
 */
export function resolveAssistantAccess(
  robots: string | null | undefined,
  tokenAllowed: (content: string, token: string) => boolean
): AgentAccess[] {
  return ASSISTANTS.map((assistant) => {
    if (robots === undefined) return { assistant, allowed: null };
    if (robots === null) return { assistant, allowed: true };
    return { assistant, allowed: ASSISTANT_ROBOTS_TOKENS[assistant].every((token) => tokenAllowed(robots, token)) };
  });
}
