/**
 * RECS-MINORS-1 (log §337). Evidence quotes are copied from engine answers,
 * which arrive in Markdown, so the card showed «**Peec AI**» (founder test,
 * P5). The quote keeps its words; only the formatting marks go.
 */
export function plainSnippet(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])[*_](\S(?:.*?\S)?)[*_](?=[^\w*]|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|>\s?)/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** P6: a long list of domains is a wall of text on a phone. */
export const DOMAIN_LIST_LIMIT = 6;

export function shortDomainList(domains: readonly string[]): { shown: string[]; hidden: number } {
  return { shown: domains.slice(0, DOMAIN_LIST_LIMIT), hidden: Math.max(0, domains.length - DOMAIN_LIST_LIMIT) };
}
