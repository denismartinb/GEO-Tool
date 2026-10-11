/**
 * PROMPT-DRAWER-ENGINES-1 (log §279) — one line per engine in the prompt
 * drawer, instead of one line per answer.
 *
 * With few prompts a scan asks each engine the same question up to five
 * times (SAMPLING-1, ADR 0030, `MAX_PROMPT_SAMPLES`). The drawer listed every
 * one of those answers as its own row, so a one-prompt project showed fifteen
 * near-identical rows labelled «muestra 1 de 5». The founder could not tell
 * what they were (2026-10-11). This module folds them per engine: how many
 * answers named the brand, the sentiment that repeats most, how many cited the
 * brand's own site, and which sources each engine used and how often.
 *
 * Pure and client-safe: the drawer is a client component.
 */
import { computeDominantBrandSentiment, type DominantBrandSentiment } from "@/lib/metrics/brand-sentiment";
import { isBrandDomain } from "@/lib/domains/brand-domain";
import { normalizeProvider } from "@/lib/scan/engine-meta";

export type SummaryCitation = {
  url?: string | null;
  domain?: string | null;
  title?: string | null;
  source?: "grounding" | "inline";
};

export type SummaryRow = {
  id: string;
  provider?: string | null;
  sample_index?: number | null;
  brand_mentioned: boolean | null;
  sentiment: string | null;
};

export type SummaryExtraction = {
  brand?: { mentioned?: boolean; evidence?: string[] };
  citations?: SummaryCitation[];
} | null;

export type EngineSource = {
  citation: SummaryCitation;
  /** Answers of this engine that used this source. */
  answers: number;
  isOwn: boolean;
};

export type EngineSummary = {
  provider: string;
  /** This engine's rows, ordered by sample. */
  rowIds: string[];
  answers: number;
  /** Same column the "La IA menciona tu marca" cell reads. */
  mentioned: number;
  sentiment: DominantBrandSentiment;
  /** Answers that cited at least one page of the brand's own domain. */
  ownCited: number;
  sources: EngineSource[];
};

function sourceKey(cite: SummaryCitation): string {
  return (cite.domain ?? cite.title ?? cite.url ?? "").toLowerCase();
}

export function summarizeEngines<R extends SummaryRow>(
  rows: readonly R[],
  extractions: readonly SummaryExtraction[],
  projectDomain: string
): EngineSummary[] {
  const groups = new Map<string, Array<{ row: R; ext: SummaryExtraction }>>();
  rows.forEach((row, i) => {
    const provider = normalizeProvider(row.provider);
    const list = groups.get(provider) ?? [];
    list.push({ row, ext: extractions[i] ?? null });
    groups.set(provider, list);
  });

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([provider, list]) => {
      list.sort((a, b) => Number(a.row.sample_index ?? 0) - Number(b.row.sample_index ?? 0));
      const sources = new Map<string, EngineSource>();
      let ownCited = 0;
      for (const { ext } of list) {
        // One count per answer: a source cited twice in the same answer is
        // still "used in one answer".
        const seen = new Set<string>();
        let citesOwn = false;
        for (const cite of ext?.citations ?? []) {
          const key = sourceKey(cite);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          const isOwn = isBrandDomain(cite.domain, projectDomain);
          if (isOwn) citesOwn = true;
          const entry = sources.get(key);
          if (entry) entry.answers += 1;
          else sources.set(key, { citation: cite, answers: 1, isOwn });
        }
        if (citesOwn) ownCited += 1;
      }
      return {
        provider,
        rowIds: list.map(({ row }) => row.id),
        answers: list.length,
        mentioned: list.filter(({ row }) => row.brand_mentioned).length,
        sentiment: computeDominantBrandSentiment(list.map(({ row }) => row)),
        ownCited,
        // The brand's own site first, then the sources this engine leaned on most.
        sources: [...sources.values()].sort((a, b) => {
          if (a.isOwn !== b.isOwn) return a.isOwn ? -1 : 1;
          return b.answers - a.answers;
        })
      };
    });
}

/** "Te nombra en 3 de 5 respuestas", or the plain form when it answered once. */
export function mentionLine(s: Pick<EngineSummary, "answers" | "mentioned">): string {
  if (s.answers <= 1) return s.mentioned > 0 ? "Te nombra" : "No te nombra";
  if (s.mentioned === 0) return `No te nombra en ninguna de sus ${s.answers} respuestas`;
  return `Te nombra en ${s.mentioned} de ${s.answers} respuestas`;
}

/** Full sentence on purpose: "en 3 de 5" alone did not say of what (founder, 2026-10-11). */
export function ownCitationLine(s: Pick<EngineSummary, "answers" | "ownCited">): string {
  if (s.ownCited === 0) return "No cita tu web";
  if (s.answers <= 1) return "Cita tu web";
  return `Cita tu web en ${s.ownCited} de ${s.answers} respuestas`;
}

/** "en 3 de 5 respuestas" next to a source; nothing when the engine answered once. */
export function sourceFrequency(answers: number, total: number): string | null {
  if (total <= 1) return null;
  return `en ${answers} de ${total} ${total === 1 ? "respuesta" : "respuestas"}`;
}
