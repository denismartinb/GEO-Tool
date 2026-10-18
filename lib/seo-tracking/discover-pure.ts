import type { GapKeyword, KeywordIdea } from "@/lib/seo-data/dataforseo-parse";
import { normalizeKeyword } from "@/lib/seo-tracking/keyword-text";

/**
 * SEO-TRACK-1 PR B (log §341): «Descubrir palabras», the pure half. Results
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

/** Ideas for a seed, without what the project already tracks, by volume. */
export function shapeSeedIdeas(ideas: KeywordIdea[], tracked: Set<string>): DiscoveredKeyword[] {
  const seen = new Set<string>();
  const out: DiscoveredKeyword[] = [];
  for (const idea of ideas) {
    const keyword = normalizeKeyword(idea.keyword);
    if (!keyword || tracked.has(keyword) || seen.has(keyword)) continue;
    seen.add(keyword);
    out.push({ keyword, volume: idea.volume, rival: null });
  }
  return out.sort(byVolume).slice(0, DISCOVERY_RESULTS);
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
