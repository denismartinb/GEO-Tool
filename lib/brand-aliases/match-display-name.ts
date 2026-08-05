/**
 * Fase −1c (docs/geo-score-variability-2026-08.md §3; ADR 0025 "Correction
 * (2026-08-03)"): the "Evidencias de mención" panel shows the quote but
 * never says the mention counted because it matched an alias rather than the
 * tracked brand string — this closes that gap.
 *
 * Mirrors `namesPlausiblyMatch` (lib/scan/extraction.ts, MENTION-VERIFY-1 /
 * ADR 0021) — same normalization, same substring-either-direction rule —
 * duplicated here rather than imported, for the same reason
 * `lib/projects/brand-aliases.ts` duplicates it: that module is a
 * server-only scan-pipeline file outside this phase's ownership, and this is
 * a purely presentational helper for the app/** UI. Keep both in sync if
 * either changes.
 *
 * Purely presentational: it never decides whether a mention counts — that
 * already happened at scan time via `verifyMention`, over the SAME set in
 * the SAME order (brand string first, then aliases). This only re-derives,
 * for display, which name in that set a model's `display_name_found` claim
 * plausibly matched.
 */

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function plausiblyMatches(claimed: string, realName: string): boolean {
  const claimedKey = normalizeName(claimed);
  const realKey = normalizeName(realName);
  if (!claimedKey || !realKey) return false;
  return claimedKey.includes(realKey) || realKey.includes(claimedKey);
}

export type DisplayNameMatch = {
  /** The brand's own known name the claimed text plausibly matched. */
  matchedName: string;
  /** True when it matched via an alias rather than the tracked brand string itself. */
  isAlias: boolean;
};

/**
 * Which of the brand's known names — the tracked brand string, checked
 * first, then `brand_aliases_snapshot` in the order they were persisted —
 * the model's claimed `display_name_found` plausibly matches.
 *
 * Returns null when nothing in the set plausibly matches. That should not
 * normally happen for a row where `mentioned: true` survived
 * `verifyExtractedMentions` at scan time (a match was required then, over
 * the same set) — but a defensive null is correct for legacy rows scored
 * before ADR 0021/0025 existed, rather than guessing it was the brand.
 */
export function matchDisplayName(
  displayNameFound: string | null | undefined,
  brand: string,
  aliases: readonly string[]
): DisplayNameMatch | null {
  const claimed = displayNameFound?.trim();
  if (!claimed) return null;

  if (brand?.trim() && plausiblyMatches(claimed, brand)) {
    return { matchedName: brand, isAlias: false };
  }

  for (const alias of aliases) {
    if (alias?.trim() && plausiblyMatches(claimed, alias)) {
      return { matchedName: alias, isAlias: true };
    }
  }

  return null;
}
