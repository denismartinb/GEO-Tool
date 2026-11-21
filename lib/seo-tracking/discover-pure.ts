import type { GapKeyword, KeywordIdea } from "@/lib/seo-data/dataforseo-parse";
import { normalizeKeyword } from "@/lib/seo-tracking/keyword-text";

/**
 * SEO-TRACK-1 PR B (log §346): «Descubrir palabras», the pure half. Results
 * are shown, never stored; the customer ticks what to track.
 */

export type DiscoveredKeyword = {
  keyword: string;
  /** Monthly searches in Spain (Google Ads data via DataForSEO); null when unknown. */
  volume: number | null;
  /** «A partir de una palabra»: none. «Las de tus rivales»: the rival and its position. */
  rival: { domain: string; position: number | null } | null;
};

export const DISCOVERY_RESULTS = 30;
export const MAX_SEED_CHARS = 80;

function byVolume(a: DiscoveredKeyword, b: DiscoveredKeyword): number {
  return (b.volume ?? -1) - (a.volume ?? -1) || a.keyword.localeCompare(b.keyword, "es");
}

/**
 * Ideas for a seed, without what the project already tracks, by volume.
 *
 * Google Ads groups close variants and hands the group's figure to each of
 * them, so a longer phrase that contains the seed can show MORE monthly
 * searches than the seed itself («cine y series» 110, a long title that
 * contains it 170), which reads as nonsense. When the seed's own figure is
 * known, those inflated variants are left out, and the seed goes first.
 */
export function shapeSeedIdeas(ideas: KeywordIdea[], tracked: Set<string>, seed?: string): DiscoveredKeyword[] {
  const seedKey = (seed ? normalizeKeyword(seed) : null) ?? "";
  const seedVolume = seedKey ? (ideas.find((idea) => normalizeKeyword(idea.keyword) === seedKey)?.volume ?? null) : null;
  const seen = new Set<string>();
  const out: DiscoveredKeyword[] = [];
  for (const idea of ideas) {
    const keyword = normalizeKeyword(idea.keyword);
    if (!keyword || tracked.has(keyword) || seen.has(keyword)) continue;
    const inflated =
      seedVolume !== null && keyword !== seedKey && keyword.includes(seedKey) && idea.volume !== null && idea.volume > seedVolume;
    if (inflated) continue;
    seen.add(keyword);
    out.push({ keyword, volume: idea.volume, rival: null });
  }
  out.sort(byVolume);
  const at = seedKey ? out.findIndex((item) => item.keyword === seedKey) : -1;
  if (at > 0) out.unshift(...out.splice(at, 1));
  return out.slice(0, DISCOVERY_RESULTS);
}

/**
 * Keywords the rivals rank for and the project does not, one row per
 * keyword, credited to the rival that ranks best for it.
 */
export function mergeRivalGaps(perRival: Array<{ domain: string; items: GapKeyword[] }>, tracked: Set<string>): DiscoveredKeyword[] {
  const best = new Map<string, DiscoveredKeyword>();
  for (const { domain, items } of perRival) {
    for (const item of items) {
      const keyword = normalizeKeyword(item.keyword);
      if (!keyword || tracked.has(keyword)) continue;
      const current = best.get(keyword);
      const position = item.competitorPosition;
      const better = !current || (position ?? 101) < (current.rival?.position ?? 101);
      if (better) best.set(keyword, { keyword, volume: item.volume ?? current?.volume ?? null, rival: { domain, position } });
    }
  }
  return [...best.values()].sort(byVolume).slice(0, DISCOVERY_RESULTS);
}

/** A seed is a word or short phrase; anything else is refused before paying for a call. */
export function cleanSeed(raw: string): string | null {
  const text = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  return text && text.length <= MAX_SEED_CHARS ? text : null;
}
