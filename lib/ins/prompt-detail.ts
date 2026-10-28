import { buildRanking, type RankingRow } from "@/components/prompts/mention-coverage";
import {
  summarizeEngines,
  type EngineSummary,
  type SummaryCitation,
} from "@/components/prompts/engine-summary";
import { computeDominantBrandSentiment } from "@/lib/metrics/brand-sentiment";
import { matchDisplayName } from "@/lib/brand-aliases/match-display-name";
import { isBrandDomain } from "@/lib/domains/brand-domain";
import { getEngineMeta } from "@/lib/scan/engine-meta";
import type { PromptRow } from "@/lib/ins/prompts-model";

/**
 * Detail of one prompt for the «Instrumento» side sheet (CONSOLE-INSTRUMENTO-1
 * F5, log §360). Same derivations the old drawer made, none new: counts come
 * from the rows, the ranking from `buildRanking`, the engines from
 * `summarizeEngines`. Pure and client-safe.
 */

export type DetailRow = PromptRow & {
  raw_response_text: string | null;
  sample_index: number | null;
  brand_snapshot: string | null;
  brand_aliases_snapshot: string[] | null;
};

type Extracted = {
  brand?: { mentioned?: boolean; evidence?: string[]; display_name_found?: string | null };
  competitors?: Array<{ name?: string; mentioned?: boolean; evidence?: string[] }>;
  citations?: SummaryCitation[];
};

function extractedOf(raw: unknown): Extracted | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Extracted) : null;
}

/**
 * The raw Google grounding redirect (vertexaisearch.cloud.google.com) is never
 * shown (docs/adr/0006): an unresolved citation falls back to its title.
 */
export function citationLabel(cite: SummaryCitation): string {
  if (cite.domain) return cite.domain;
  if (cite.source === "grounding") return cite.title?.trim() || "Fuente sin resolver";
  return cite.url ?? "—";
}

export type AnswerView = {
  row: DetailRow;
  mentioned: boolean;
  sentiment: string | null;
  citesOwn: boolean;
  sources: number;
};

export type EngineDetail = {
  provider: string;
  label: string;
  summary: EngineSummary;
  answers: AnswerView[];
};

export type EvidenceGroup = {
  provider: string;
  label: string;
  evidence: string[];
  aliasName: string | null;
};

export type PromptDetail = {
  totalAnswers: number;
  mentionedAnswers: number;
  ownCitedAnswers: number;
  mentioned: boolean;
  ownCited: boolean;
  engines: EngineDetail[];
  ranking: RankingRow[];
  evidence: EvidenceGroup[];
  hasAnySource: boolean;
  /** Same count for every engine, or null when they differ. */
  sameAnswerCount: number | null;
};

export function buildPromptDetail(input: {
  rows: DetailRow[];
  projectDomain: string;
  projectBrand: string;
  competitors: Array<{ name: string }>;
}): PromptDetail {
  const { rows, projectDomain, projectBrand, competitors } = input;
  const extractedList = rows.map((r) => extractedOf(r.extracted_json));
  const summaries = summarizeEngines(rows, extractedList, projectDomain);
  const rowById = new Map(rows.map((r, i) => [r.id, { row: r, ext: extractedList[i] }]));

  const engines: EngineDetail[] = summaries.map((summary) => ({
    provider: summary.provider,
    label: getEngineMeta(summary.provider).label,
    summary,
    answers: summary.rowIds.map((id) => {
      const { row, ext } = rowById.get(id)!;
      const cites = ext?.citations ?? [];
      return {
        row,
        mentioned: Boolean(row.brand_mentioned),
        sentiment: row.sentiment,
        citesOwn: cites.some((c) => isBrandDomain(c.domain, projectDomain)),
        sources: new Set(cites.map((c) => (c.domain ?? c.title ?? c.url ?? "").toLowerCase()).filter(Boolean)).size,
      };
    }),
  }));

  const brandEvidence = Array.from(new Set(extractedList.flatMap((e) => e?.brand?.evidence ?? [])));
  const ranking = buildRanking({
    results: rows,
    extractedList,
    competitors,
    brandEvidence,
    brandSentiment: computeDominantBrandSentiment(rows),
    brandName: projectBrand,
  });

  // An engine joins the quotes when it brings some or when its mention is
  // verified without one (PROMPT-DRAWER-TRUTH-1, log §147). The verification
  // is read from `extracted_json`, never from the naive column.
  const evidence = summaries
    .map((s) => {
      const entries = s.rowIds.map((id) => rowById.get(id)!);
      const quotes = Array.from(new Set(entries.flatMap(({ ext }) => ext?.brand?.evidence ?? [])));
      const verified = entries.some(({ ext }) => Boolean(ext?.brand?.mentioned));
      const alias =
        entries
          .map(({ row, ext }) =>
            matchDisplayName(ext?.brand?.display_name_found, row.brand_snapshot ?? projectBrand, row.brand_aliases_snapshot ?? []),
          )
          .find((m) => m?.isAlias) ?? null;
      return {
        provider: s.provider,
        label: getEngineMeta(s.provider).label,
        evidence: quotes,
        aliasName: alias?.matchedName ?? null,
        keep: quotes.length > 0 || verified,
      };
    })
    .filter((g) => g.keep)
    .map(({ keep: _keep, ...g }) => g);

  const counts = new Set(summaries.map((s) => s.answers));
  return {
    totalAnswers: rows.length,
    mentionedAnswers: rows.filter((r) => r.brand_mentioned).length,
    ownCitedAnswers: engines.reduce((n, e) => n + e.answers.filter((a) => a.citesOwn).length, 0),
    mentioned: rows.some((r) => r.brand_mentioned),
    ownCited: summaries.some((s) => s.ownCited > 0),
    engines,
    ranking,
    evidence,
    hasAnySource: summaries.some((s) => s.sources.length > 0),
    sameAnswerCount: counts.size === 1 ? summaries[0].answers : null,
  };
}
