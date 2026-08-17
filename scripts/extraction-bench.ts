/**
 * EXTRACTION-COST-BENCH-1 — offline bench for the structured-extraction step.
 *
 * Extraction (lib/scan/extraction.ts) runs once per scan_prompt_results row,
 * with the SAME provider that generated the row (extractGeminiStructuredData /
 * extractClaudeStructuredData / extractOpenAIStructuredData), for no technical
 * reason — the input is `raw_response_text`, already persisted, and any
 * extractor can parse it regardless of which engine produced it. Nobody has
 * measured whether a single cheap model could do this for all three
 * providers' text, because extraction never records tokens or cost
 * (docs/brand/design-decisions-log.md, the LLM cost breakdown conversation).
 *
 * This script re-runs extraction on HISTORICAL rows with cheaper candidate
 * models and compares the result against what is already persisted —
 * offline, read-only, zero impact on any running scan. It answers one
 * question: does a cheaper extractor degrade the fields that actually feed
 * scoring (brand_mentioned, mentioned_competitors_count, sentiment)?
 *
 * NOT compared: citations_count / citation_found. Those are computed from
 * `raw_response_json.grounding_chunks` — metadata frozen at GENERATION time —
 * so no extraction model, cheap or not, can ever change them
 * (lib/scan/extraction.ts, buildGroundedCitations). Comparing them here would
 * measure nothing.
 *
 * Cost is ESTIMATED, not measured: none of the three extract*StructuredData
 * functions return provider usage (that gap is exactly what this bench
 * exists to inform fixing, in a later phase — out of scope here per the
 * approved Task Intake, which forbids touching lib/llm/**). The estimate is a
 * plain chars/4 heuristic against public per-token pricing. Good enough for a
 * go/no-go, not a substitute for real `usage` once the model choice is made.
 *
 * Read-only by construction: only .select() calls against Supabase appear in
 * this file. scripts/extraction-bench.test.ts fails the build if that ever
 * stops being true.
 *
 * Usage:
 *   pnpm bench:extraction --limit 60
 *
 * Why `pnpm bench:extraction` sets NODE_OPTIONS=--conditions=react-server:
 * every module this script reuses from lib/** (extraction.ts, gemini.ts,
 * openai.ts, supabase/service.ts) opens with `import "server-only"`. Inside
 * `next build`/`next dev` that resolves to a no-op because Next's bundler
 * sets the same `react-server` export condition on the server compilation
 * graph; a plain `node`/`tsx` process doesn't set it, so the package's
 * default export (which unconditionally throws) is what loads instead. This
 * flag is the documented, first-party way to reproduce that condition outside
 * Next's bundler — no custom loader, no touching lib/**.
 */

import { createServiceClient } from "../lib/supabase/service";
import { extractGeminiStructuredData } from "../lib/llm/gemini";
import { extractOpenAIStructuredData } from "../lib/llm/openai";
import { verifyExtractedMentions, reconcileExtractedCompetitors } from "../lib/scan/extraction";
import { EXTRACTION_VERSION } from "../lib/scan/constants";
import { existsSync, readFileSync } from "node:fs";

/* ---- Pure helpers (covered by extraction-bench.test.ts, no network) ---- */

/** Rough chars-per-token heuristic. Not a real tokenizer — see file header. */
export function estimateTokensFromChars(chars: number): number {
  return Math.ceil(Math.max(0, chars) / 4);
}

export function estimateCallCostUsd(input: {
  inputChars: number;
  outputChars: number;
  pricePerMillionInputUsd: number;
  pricePerMillionOutputUsd: number;
}): number {
  const inputTokens = estimateTokensFromChars(input.inputChars);
  const outputTokens = estimateTokensFromChars(input.outputChars);
  return (
    (inputTokens / 1_000_000) * input.pricePerMillionInputUsd +
    (outputTokens / 1_000_000) * input.pricePerMillionOutputUsd
  );
}

export type GroundTruth = {
  brandMentioned: boolean;
  mentionedCompetitorsCount: number;
  sentiment: string;
};

export type FieldAgreement = {
  brandMentioned: boolean;
  mentionedCompetitorsCount: boolean;
  sentiment: boolean;
};

export function compareToGroundTruth(groundTruth: GroundTruth, candidate: GroundTruth): FieldAgreement {
  return {
    brandMentioned: groundTruth.brandMentioned === candidate.brandMentioned,
    mentionedCompetitorsCount: groundTruth.mentionedCompetitorsCount === candidate.mentionedCompetitorsCount,
    sentiment: groundTruth.sentiment === candidate.sentiment
  };
}

export type CandidateStats = {
  key: string;
  rows: number;
  errors: number;
  brandMentionedAgree: number;
  mentionedCompetitorsCountAgree: number;
  sentimentAgree: number;
  totalEstimatedCostUsd: number;
};

export function createEmptyStats(key: string): CandidateStats {
  return {
    key,
    rows: 0,
    errors: 0,
    brandMentionedAgree: 0,
    mentionedCompetitorsCountAgree: 0,
    sentimentAgree: 0,
    totalEstimatedCostUsd: 0
  };
}

/** Immutable fold — never mutates `stats`, matching the read-only spirit of the whole script. */
export function foldRowOutcome(
  stats: CandidateStats,
  outcome: { agreement: FieldAgreement; estimatedCostUsd: number } | { error: true }
): CandidateStats {
  if ("error" in outcome) {
    return { ...stats, rows: stats.rows + 1, errors: stats.errors + 1 };
  }
  return {
    ...stats,
    rows: stats.rows + 1,
    brandMentionedAgree: stats.brandMentionedAgree + (outcome.agreement.brandMentioned ? 1 : 0),
    mentionedCompetitorsCountAgree: stats.mentionedCompetitorsCountAgree + (outcome.agreement.mentionedCompetitorsCount ? 1 : 0),
    sentimentAgree: stats.sentimentAgree + (outcome.agreement.sentiment ? 1 : 0),
    totalEstimatedCostUsd: stats.totalEstimatedCostUsd + outcome.estimatedCostUsd
  };
}

function pct(numerator: number, denominator: number): string {
  if (denominator <= 0) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export function formatStatsTable(allStats: CandidateStats[]): string {
  const header =
    "| candidato | filas | errores | acuerdo brand_mentioned | acuerdo mentioned_competitors_count | acuerdo sentiment | coste estimado/llamada |";
  const separator = "|---|---|---|---|---|---|---|";
  const rows = allStats.map((s) => {
    const compared = s.rows - s.errors;
    const avgCost = compared > 0 ? (s.totalEstimatedCostUsd / compared).toFixed(6) : "—";
    return `| ${s.key} | ${s.rows} | ${s.errors} | ${pct(s.brandMentionedAgree, compared)} | ${pct(s.mentionedCompetitorsCountAgree, compared)} | ${pct(s.sentimentAgree, compared)} | $${avgCost} |`;
  });
  return [header, separator, ...rows].join("\n");
}

export function parseLimitArg(argv: string[], defaultLimit: number): number {
  const idx = argv.indexOf("--limit");
  if (idx === -1 || idx + 1 >= argv.length) return defaultLimit;
  const parsed = Number.parseInt(argv[idx + 1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultLimit;
}

/* ---- Candidates ---- */

type CandidateDef = {
  key: string;
  provider: "gemini" | "openai";
  model: string;
  envVar: "GEMINI_MODEL" | "OPENAI_MODEL";
  pricePerMillionInputUsd: number;
  pricePerMillionOutputUsd: number;
};

/**
 * Prices are public list rates gathered 2026-08 (see the LLM cost breakdown
 * conversation this bench comes from) — re-check before trusting them months
 * later. gemini-2.5-flash is included as a reference: for rows generated by
 * Gemini, it reproduces production's own extraction call almost exactly
 * (same model, same function), so its agreement rate is a sanity check on
 * the bench itself, not a finding.
 */
const CANDIDATES: readonly CandidateDef[] = [
  {
    key: "gemini-2.5-flash-lite",
    provider: "gemini",
    model: "gemini-2.5-flash-lite",
    envVar: "GEMINI_MODEL",
    pricePerMillionInputUsd: 0.1,
    pricePerMillionOutputUsd: 0.4
  },
  {
    key: "gemini-2.5-flash",
    provider: "gemini",
    model: "gemini-2.5-flash",
    envVar: "GEMINI_MODEL",
    pricePerMillionInputUsd: 0.3,
    pricePerMillionOutputUsd: 2.5
  },
  {
    key: "gpt-4o-mini",
    provider: "openai",
    model: "gpt-4o-mini",
    envVar: "OPENAI_MODEL",
    pricePerMillionInputUsd: 0.15,
    pricePerMillionOutputUsd: 0.6
  }
];

const PROVIDER_STRATA = ["gemini", "claude", "openai"] as const;

/* ---- I/O (not covered by unit tests — needs live credentials) ---- */

/** Same minimal, non-overwriting .env.local loader as scripts/pilot.mjs. */
function loadDotEnvLocal(path = ".env.local"): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

type BenchRow = {
  id: string;
  provider: string;
  raw_response_text: string | null;
  prompt_text_snapshot: string;
  brand_snapshot: string;
  brand_aliases_snapshot: string[] | null;
  competitors_snapshot: Array<{ name?: string }> | null;
  brand_mentioned: boolean | null;
  mentioned_competitors_count: number | null;
  sentiment: string | null;
};

async function fetchSampleRows(limit: number): Promise<BenchRow[]> {
  const service = createServiceClient();
  const perStratum = Math.max(1, Math.ceil(limit / PROVIDER_STRATA.length));

  const results = await Promise.all(
    PROVIDER_STRATA.map((provider) =>
      service
        .from("scan_prompt_results")
        .select(
          "id, provider, raw_response_text, prompt_text_snapshot, brand_snapshot, brand_aliases_snapshot, competitors_snapshot, brand_mentioned, mentioned_competitors_count, sentiment"
        )
        .eq("provider", provider)
        .eq("status", "completed")
        .eq("extraction_version", EXTRACTION_VERSION)
        .not("raw_response_text", "is", null)
        .order("created_at", { ascending: false })
        .limit(perStratum)
    )
  );

  const rows: BenchRow[] = [];
  for (const { data, error } of results) {
    if (error) throw error;
    if (data) rows.push(...(data as BenchRow[]));
  }
  return rows;
}

async function runCandidateExtraction(
  candidate: CandidateDef,
  args: { brand: string; competitors: string[]; rawResponseText: string; promptText: string }
) {
  const previous = process.env[candidate.envVar];
  process.env[candidate.envVar] = candidate.model;
  try {
    return candidate.provider === "gemini"
      ? await extractGeminiStructuredData(args)
      : await extractOpenAIStructuredData(args);
  } finally {
    if (previous === undefined) delete process.env[candidate.envVar];
    else process.env[candidate.envVar] = previous;
  }
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const limit = parseLimitArg(process.argv.slice(2), 60);

  console.log(`EXTRACTION-COST-BENCH-1 — muestreando hasta ${limit} filas (${PROVIDER_STRATA.join("/")})...`);
  const rows = await fetchSampleRows(limit);
  console.log(`${rows.length} filas elegibles (extraction_version="${EXTRACTION_VERSION}", raw_response_text presente).`);

  let statsByCandidate = new Map<string, CandidateStats>(CANDIDATES.map((c) => [c.key, createEmptyStats(c.key)]));
  let skipped = 0;

  for (const [rowIndex, row] of rows.entries()) {
    if (row.brand_mentioned === null || row.mentioned_competitors_count === null || row.sentiment === null || !row.raw_response_text) {
      skipped += 1;
      continue;
    }

    const competitors = (row.competitors_snapshot ?? [])
      .map((item) => (item?.name ? String(item.name) : ""))
      .filter((name) => name.length > 0);
    const brandAliases = row.brand_aliases_snapshot ?? [];
    const groundTruth: GroundTruth = {
      brandMentioned: row.brand_mentioned,
      mentionedCompetitorsCount: row.mentioned_competitors_count,
      sentiment: row.sentiment
    };

    console.log(`[${rowIndex + 1}/${rows.length}] fila ${row.id} (generada por ${row.provider})`);

    for (const candidate of CANDIDATES) {
      const stats = statsByCandidate.get(candidate.key);
      if (!stats) continue;

      try {
        const extracted = await runCandidateExtraction(candidate, {
          brand: row.brand_snapshot,
          competitors,
          rawResponseText: row.raw_response_text,
          promptText: row.prompt_text_snapshot
        });

        const verified = verifyExtractedMentions(extracted.data, row.raw_response_text, row.brand_snapshot, brandAliases);
        const reconciled = reconcileExtractedCompetitors(verified, competitors);
        const candidateOutcome: GroundTruth = {
          brandMentioned: reconciled.brand.mentioned,
          mentionedCompetitorsCount: reconciled.competitors.filter((c) => c.mentioned).length,
          sentiment: reconciled.sentiment
        };

        const inputChars =
          row.brand_snapshot.length + competitors.join(", ").length + row.prompt_text_snapshot.length + row.raw_response_text.length;
        const outputChars = JSON.stringify(extracted.data).length;
        const estimatedCostUsd = estimateCallCostUsd({
          inputChars,
          outputChars,
          pricePerMillionInputUsd: candidate.pricePerMillionInputUsd,
          pricePerMillionOutputUsd: candidate.pricePerMillionOutputUsd
        });

        statsByCandidate.set(
          candidate.key,
          foldRowOutcome(stats, { agreement: compareToGroundTruth(groundTruth, candidateOutcome), estimatedCostUsd })
        );
      } catch (err) {
        console.error(`  ${candidate.key} falló en fila ${row.id}:`, err instanceof Error ? err.message : err);
        statsByCandidate.set(candidate.key, foldRowOutcome(stats, { error: true }));
      }
    }
  }

  if (skipped > 0) {
    console.log(`\n${skipped} filas omitidas (sin brand_mentioned/mentioned_competitors_count/sentiment persistidos).`);
  }

  console.log("\nResultado (agregado, TODAS las filas independientemente del proveedor que generó la respuesta):\n");
  console.log(formatStatsTable(Array.from(statsByCandidate.values())));
  console.log(
    "\nCoste estimado con heurística chars/4 contra precios públicos por token — no son tokens reales devueltos por el proveedor. Ver cabecera del script."
  );
}

// Only run when invoked directly (`tsx scripts/extraction-bench.ts` /
// `pnpm bench:extraction`) — NOT when this module is imported for its pure
// helpers, which is exactly what extraction-bench.test.ts does. Without this
// guard, importing the file for a unit test would also kick off a live
// Supabase call and leave the test process's exit code non-zero.
const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  main().catch((err) => {
    console.error("EXTRACTION-COST-BENCH-1 falló:", err);
    process.exitCode = 1;
  });
}
