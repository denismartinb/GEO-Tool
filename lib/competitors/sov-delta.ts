/**
 * Scan-over-scan share-of-voice delta for the Competitors page podium
 * (COMP-REDESIGN-1) — "▲ 3 pts" next to each entity's cumulative SoV.
 *
 * Deliberately a SEPARATE metric from the page's headline SoV number, which
 * stays cumulative across every completed run (unchanged by this feature —
 * see the design doc's decision not to touch that formula). This module
 * compares the latest single run against the immediately previous single
 * run only, the same way a stock's daily change is a different number from
 * its all-time average. Both are real, neither is fake, they just answer
 * different questions ("where do you stand overall" vs "did this scan move
 * the needle") — kept in one clearly-scoped module so they can't blur
 * together the way ADR 0018 warns same-named metrics can.
 */

export type SovDeltaInputRow = {
  runId: string;
  extracted_json: unknown;
};

export type SovDeltaEntry = {
  currentSov: number | null;
  previousSov: number | null;
  /** currentSov - previousSov, rounded points. Null when there's no previous run to compare against. */
  deltaPoints: number | null;
};

type ExtractedJsonLike = {
  brand?: { mentioned?: boolean };
  competitors?: Array<{ name?: string; mentioned?: boolean }>;
};

function parseExt(raw: unknown): ExtractedJsonLike {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as ExtractedJsonLike;
}

function normKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Same denominator convention as the page's existing cumulative computation: brand + every ever-tracked competitor's mentions (active or inactive), scoped to one run's rows only. */
function sovForRunSubset(
  rows: SovDeltaInputRow[],
  runId: string | null,
  trackedCompetitors: Array<{ name: string }>
): { brand: number; competitors: Map<string, number> } | null {
  if (!runId) return null;
  const subset = rows.filter((r) => r.runId === runId);
  if (subset.length === 0) return null;

  let brandMentions = 0;
  const competitorMentionMap = new Map<string, number>();

  for (const row of subset) {
    const ext = parseExt(row.extracted_json);
    if (ext.brand?.mentioned) brandMentions += 1;
    for (const c of ext.competitors ?? []) {
      if (!c.mentioned || !c.name) continue;
      const key = normKey(c.name);
      competitorMentionMap.set(key, (competitorMentionMap.get(key) ?? 0) + 1);
    }
  }

  const denominator =
    brandMentions +
    trackedCompetitors.reduce((sum, c) => sum + (competitorMentionMap.get(normKey(c.name)) ?? 0), 0);

  if (denominator === 0) {
    return { brand: 0, competitors: new Map(trackedCompetitors.map((c) => [normKey(c.name), 0])) };
  }

  const brand = Math.round((brandMentions / denominator) * 100);
  const competitors = new Map(
    trackedCompetitors.map((c) => {
      const key = normKey(c.name);
      const mentions = competitorMentionMap.get(key) ?? 0;
      return [key, Math.round((mentions / denominator) * 100)];
    })
  );

  return { brand, competitors };
}

export function computeSovDeltas(input: {
  rows: SovDeltaInputRow[];
  latestRunId: string;
  previousRunId: string | null;
  /** Every tracked competitor ever seen for this project (active or inactive) — matches the page's existing SoV denominator exactly. */
  trackedCompetitors: Array<{ name: string }>;
}): { brand: SovDeltaEntry; competitors: Map<string, SovDeltaEntry> } {
  const current = sovForRunSubset(input.rows, input.latestRunId, input.trackedCompetitors);
  const previous = sovForRunSubset(input.rows, input.previousRunId, input.trackedCompetitors);

  const brand: SovDeltaEntry = {
    currentSov: current?.brand ?? null,
    previousSov: previous?.brand ?? null,
    deltaPoints: current && previous ? current.brand - previous.brand : null
  };

  const competitors = new Map<string, SovDeltaEntry>();
  for (const c of input.trackedCompetitors) {
    const key = normKey(c.name);
    const currentSov = current?.competitors.get(key) ?? null;
    const previousSov = previous?.competitors.get(key) ?? null;
    competitors.set(key, {
      currentSov,
      previousSov,
      deltaPoints: currentSov !== null && previousSov !== null ? currentSov - previousSov : null
    });
  }

  return { brand, competitors };
}
