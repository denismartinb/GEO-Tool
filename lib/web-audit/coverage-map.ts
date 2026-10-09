/**
 * Coverage-map types and parsing, shared between the domain-coverage
 * generation core (lib/recommendations/domain-coverage.ts) and the "Auditoría
 * web" section (WEB-AUDIT-1). Extracted rather than duplicated so both sides
 * agree on the exact persisted shape.
 *
 * Deliberately NOT marked `import "server-only"`: this is pure parsing logic
 * with no I/O, importable from Vitest and from server components alike (same
 * pattern as lib/recommendations/generation-rate-limit.ts).
 */

export type DomainCoveragePage = { url: string; title: string };

export type DomainCoverageTopic = {
  promptId: string;
  topic: string;
  found: boolean;
  pages: DomainCoveragePage[];
  note: string;
};

export type DomainCoverageMap = {
  scanId: string;
  generatedAt: string;
  topics: DomainCoverageTopic[];
  /**
   * COVERAGE-WEEKLY-1: when the own-site pages were actually searched for,
   * if that differs from `generatedAt`. Present only on a map carried forward
   * from an earlier scan (`carryForwardCoverage`): `generatedAt` is then the
   * moment the map was attached to the new scan — the citation window and the
   * trend need that, because they are about the scan — and this is the age of
   * the evidence about the site. Absent means `generatedAt` is both.
   */
  verifiedAt?: string;
};

// Exported (read-only reuse, no behavior change) so callers like
// coverage-overlay.ts and the web-audit opportunity matrix can distinguish a
// genuinely-confirmed "not covered" topic from an inconclusive one (transient
// Gemini failure / budget cutoff) without string-matching a duplicated
// literal — both currently produce found:false, but only the former is safe
// to reframe as "possible content gap" / count toward coverage denominators.
export const NOT_COVERED_NOTE =
  "No hemos encontrado contenido publicado en tu dominio sobre este tema a través de la búsqueda de Google.";
export const COULD_NOT_VERIFY_NOTE = "No hemos podido verificar la cobertura de este tema en este momento.";

/**
 * Dedupes a list of coverage-map snapshots by scanId, keeping the most
 * recently generated one for each — re-auditing the same scan (cache-hit or
 * not) can otherwise repeat a scanId across the persisted history rows.
 * Shared by trend.ts (per-point series) and opportunity-matrix.ts
 * (citation-window candidates) so both agree on exactly one snapshot per scan.
 */
export function dedupeMapsByScanId(maps: DomainCoverageMap[]): DomainCoverageMap[] {
  const latestByScanId = new Map<string, DomainCoverageMap>();
  for (const map of maps) {
    const existing = latestByScanId.get(map.scanId);
    if (!existing || existing.generatedAt < map.generatedAt) {
      latestByScanId.set(map.scanId, map);
    }
  }
  return Array.from(latestByScanId.values());
}

export function parseCoverageMap(raw: string | null): DomainCoverageMap | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.scanId !== "string" || typeof parsed.generatedAt !== "string" || !Array.isArray(parsed.topics)) {
      return null;
    }
    const topics = parsed.topics.filter((t): t is DomainCoverageTopic => {
      const c = t as Record<string, unknown> | null;
      return (
        Boolean(c) &&
        typeof c?.promptId === "string" &&
        typeof c?.topic === "string" &&
        typeof c?.found === "boolean" &&
        typeof c?.note === "string" &&
        Array.isArray(c?.pages)
      );
    });
    const verifiedAt = typeof parsed.verifiedAt === "string" ? parsed.verifiedAt : undefined;
    return {
      scanId: parsed.scanId,
      generatedAt: parsed.generatedAt,
      topics,
      ...(verifiedAt ? { verifiedAt } : {})
    };
  } catch {
    return null;
  }
}

/**
 * COVERAGE-WEEKLY-1 (log §253). How long an automatic coverage campaign's
 * findings are reused before the own site is searched again.
 *
 * The coverage campaign asks Gemini to search the brand's OWN website, once
 * per active prompt, after every completed scan. What it measures — whether
 * the site has published a page about a topic — changes when the customer
 * publishes, not when the AI answers differently, so re-searching it every
 * day bought nothing while it was the second-largest LLM cost per scan once
 * Gemini 3 started billing grounding per search query
 * (`docs/llm-cost-analysis-2026-08.md`, §8 — the 2026-10 addendum).
 *
 * Seven days less a twelve-hour slack: the daily cron does not fire at the
 * exact same minute, so a strict 7 × 24 h would push the weekly refresh to
 * day 8 every other week.
 */
export const COVERAGE_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60_000 - 12 * 60 * 60_000;

/**
 * Re-attaches a recent coverage map to a newer scan instead of searching the
 * site again. Pure — the caller decides whether to persist it.
 *
 * Returns null — meaning "run a real campaign" — whenever reusing would be
 * less than what a fresh campaign gives:
 * - the evidence is older than `COVERAGE_REFRESH_INTERVAL_MS`;
 * - an active prompt has no topic in the map (a prompt added since), because
 *   a campaign topped up with one new prompt would restamp every old topic
 *   as fresh and the weekly refresh would never come;
 * - any topic is inconclusive (`COULD_NOT_VERIFY_NOTE`): that is a failed
 *   check, and carrying it would hide it for a week.
 *
 * Topics for prompts no longer active are dropped, same as a fresh campaign
 * would never have audited them.
 */
export function carryForwardCoverage(input: {
  map: DomainCoverageMap;
  activePromptIds: readonly string[];
  scanId: string;
  now: number;
}): DomainCoverageMap | null {
  const verifiedAt = input.map.verifiedAt ?? input.map.generatedAt;
  const verifiedMs = Date.parse(verifiedAt);
  if (!Number.isFinite(verifiedMs)) return null;
  if (input.now - verifiedMs >= COVERAGE_REFRESH_INTERVAL_MS) return null;

  const byPromptId = new Map(input.map.topics.map((t) => [t.promptId, t]));
  const topics: DomainCoverageTopic[] = [];
  for (const promptId of input.activePromptIds) {
    const topic = byPromptId.get(promptId);
    if (!topic || topic.note === COULD_NOT_VERIFY_NOTE) return null;
    topics.push(topic);
  }
  if (topics.length === 0) return null;

  return {
    scanId: input.scanId,
    generatedAt: new Date(input.now).toISOString(),
    topics,
    verifiedAt
  };
}
