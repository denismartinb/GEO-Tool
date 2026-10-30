/**
 * Competidores in the «Instrumento» system (CONSOLE-INSTRUMENTO-1 F5b, log §374).
 * Pure: the page already computed every figure from stored rows; this only
 * orders, shades and phrases them, so nothing here can invent a number.
 */

export type RankEntry = {
  key: string;
  name: string;
  domain: string;
  you: boolean;
  /** % of all analysed answers that name the brand (cumulative, as the lead sentence). */
  mentionRate: number;
  /** % of all analysed answers that cite its web. */
  citationRate: number;
  /** Mean position when named, from the last scan; null when it was never named there. */
  meanRank: number | null;
  /** False when the mean rests on too few answers to compare (SAMPLE-FLOOR-1, log §175). */
  qualified: boolean;
};

/**
 * Order by mentions, the figure the list is named after (log §353). The mean
 * position only breaks ties, and an unqualified or missing one sorts last, so
 * a brand named once and first never leads the list.
 */
export function orderRanking(entries: RankEntry[]): RankEntry[] {
  const rankOf = (e: RankEntry) => (e.meanRank != null && e.qualified ? e.meanRank : Number.POSITIVE_INFINITY);
  return [...entries].sort(
    (a, b) => b.mentionRate - a.mentionRate || rankOf(a) - rankOf(b) || Number(b.you) - Number(a.you),
  );
}

/** Heat-map tone: 8% for an empty cell up to 80% at the strongest one on screen. */
export function heatTone(value: number, max: number): number {
  const top = Math.max(max, 1);
  return Math.round(8 + (Math.min(value, top) / top) * 72);
}

export type LeadInput = {
  brand: string;
  hasData: boolean;
  brandMentionRate: number;
  top: { name: string; mentionRate: number } | null;
  /** Engine where the brand beats `top` by the widest margin, if any. */
  winsOn: string | null;
};

export type LeadPart = { text: string; strong?: boolean };

/** The sentence under the title. Only states what the figures show. */
export function competitorsLead(input: LeadInput): LeadPart[] {
  const { brand, hasData, brandMentionRate, top, winsOn } = input;
  if (!hasData) return [];
  if (!top || top.mentionRate === 0) {
    return [
      { text: "Ningún competidor de tu lista ha sido nombrado en los escaneos analizados. Revisa si tus prompts son lo bastante comparativos." },
    ];
  }
  if (top.mentionRate > brandMentionRate) {
    return [
      { text: top.name, strong: true },
      { text: ` es tu rival más fuerte: la nombran en el ${top.mentionRate}% de las respuestas y a ti en el ${brandMentionRate}%.` },
      ...(winsOn ? [{ text: " Le ganas en " }, { text: winsOn, strong: true }, { text: "." }] : []),
    ];
  }
  return [
    { text: brand, strong: true },
    { text: ` te nombran en el ${brandMentionRate}% de las respuestas, y a ${top.name}, tu rival más nombrado, en el ${top.mentionRate}%.` },
  ];
}

export type EvoSeries = { key: string; label: string; isBrand?: boolean; values: Array<number | null> };

/** Line identity: the brand is blue and solid; rivals are ink shades told apart by dash and a direct label. */
const RIVAL_STYLES: Array<{ stroke: string; dash: string; width: number }> = [
  { stroke: "var(--ink)", dash: "", width: 1.5 },
  { stroke: "var(--ink-3)", dash: "5 4", width: 1.5 },
  { stroke: "var(--ink-3)", dash: "", width: 1.5 },
  { stroke: "var(--ink-4)", dash: "2 4", width: 1.5 },
];

export function lineStyle(series: EvoSeries, rivalIndex: number) {
  if (series.isBrand) return { stroke: "var(--blue)", dash: "", width: 2.25 };
  return RIVAL_STYLES[rivalIndex % RIVAL_STYLES.length];
}

/** Splits a series into runs of consecutive points: a scan without a position is a gap, never a bridge. */
export function segments(values: Array<number | null>): Array<Array<{ i: number; v: number }>> {
  const out: Array<Array<{ i: number; v: number }>> = [];
  let cur: Array<{ i: number; v: number }> = [];
  values.forEach((v, i) => {
    if (v == null) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push({ i, v });
  });
  if (cur.length) out.push(cur);
  return out;
}

/** End labels nudged apart so they never collide. */
export function spreadLabels<T extends { y: number }>(labels: T[], gap = 16): T[] {
  const sorted = [...labels].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y - sorted[i - 1].y < gap) sorted[i] = { ...sorted[i], y: sorted[i - 1].y + gap };
  }
  return sorted;
}
