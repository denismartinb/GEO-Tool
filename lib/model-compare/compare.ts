import { EXTRACTION_VERSION } from "@/lib/scan/constants";
import { computeRunScoresFromResults, getEffectiveGeoScore, type ScoreInputRow } from "@/lib/scoring/run-scoring";
import { answerCost, COMPARE_ENGINES, type CompareEngine } from "@/lib/model-compare/catalogue";

/**
 * MODEL-COMPARE-1 (log §269) — what the operator's model comparison measures
 * and how it decides "equivalent".
 *
 * Three passes over the same questions:
 *  - `a`: production as it runs today (generation AND extraction), the real
 *    baseline and the real cost;
 *  - `a2`: the same as `a` again — two runs of the same models never agree
 *    100%, and this is how much they disagree, the yardstick for the rest;
 *  - `b`: the candidate models.
 *
 * The score is the scan's own composite (`computeRunScoresFromResults`)
 * without the technical component, identical for every pass, so it is a
 * "nota de la pasada" for comparing passes, never the customer's Puntuación
 * GEO. Nothing here writes anywhere.
 *
 * Server-side only (the scoring module is): the page imports types from here
 * and nothing else; what the browser needs at runtime lives in the catalogue.
 */

export type ComparePass = "a" | "a2" | "b";
export const COMPARE_PASSES: ComparePass[] = ["a", "a2", "b"];

type Sentiment = ScoreInputRow["sentiment"];

/**
 * The part of `extracted_json` the score reads, and nothing else. The browser
 * holds every answer and sends them back to be scored, through a server
 * action capped at 1 MB (`next.config` `bodySizeLimit`) — evidence, summaries
 * and notes would blow it on a long comparison and the score never reads them.
 */
export type SlimExtracted = {
  brand: { mentioned: boolean; position: number | null };
  competitors: Array<{ name: string; mentioned: boolean; position: number | null }>;
  citations: Array<{ domain: string | null; source: string }>;
  other_brands_mentioned: string[];
};

export type CompareUsage = {
  generationIn: number;
  generationOut: number;
  /** Search queries / tool calls the provider reported, or null when it reports none (Claude). */
  searches: number | null;
  extractionIn: number;
  extractionOut: number;
};

export type CompareRow = {
  brand_mentioned: boolean;
  citation_found: boolean;
  mentioned_competitors_count: number;
  citations_count: number;
  sentiment: Sentiment;
  extracted_json: SlimExtracted;
};

type AnswerKey = { engine: CompareEngine; pass: ComparePass; promptIndex: number; sample: number };

export type CompareAnswerOk = AnswerKey & {
  error: null;
  generationModel: string;
  extractionModel: string;
  usage: CompareUsage;
  row: CompareRow;
  brandPosition: number | null;
  namedBrands: string[];
  citedDomains: string[];
  /** The answer hit the scan's output cap and was cut short (only measurable for Claude today). */
  truncated?: boolean;
};

export type CompareAnswerFailed = AnswerKey & { error: string };

export type CompareAnswer = CompareAnswerOk | CompareAnswerFailed;

export function isOk(answer: CompareAnswer): answer is CompareAnswerOk {
  return answer.error === null;
}

export function slimExtracted(data: {
  brand: { mentioned: boolean; position: number | null };
  competitors: Array<{ name: string; mentioned: boolean; position: number | null }>;
  citations: Array<{ domain?: string | null; source: string }>;
  other_brands_mentioned?: string[];
}): SlimExtracted {
  return {
    brand: { mentioned: data.brand.mentioned, position: data.brand.position },
    competitors: data.competitors.map((c) => ({ name: c.name, mentioned: c.mentioned, position: c.position })),
    citations: data.citations
      .filter((c) => c.source === "grounding")
      .map((c) => ({ domain: c.domain ?? null, source: c.source })),
    other_brands_mentioned: data.other_brands_mentioned ?? []
  };
}

// ---------------------------------------------------------------- scoring

export type PassScore = {
  /** Composite over every engine's answers, or null with no usable answer. */
  overall: number | null;
  byEngine: Record<CompareEngine, number | null>;
  answered: number;
  failed: number;
  /** Measured cost in USD; `pricedAnswers` < `answered` means some answer had no price. */
  cost: number;
  pricedAnswers: number;
  /** Mean measured cost of one answer per engine, null with no priced answer. */
  costPerAnswer: Record<CompareEngine, number | null>;
};

function toScoreRow(answer: CompareAnswerOk, brand: string): ScoreInputRow {
  return {
    id: `${answer.pass}:${answer.engine}:${answer.promptIndex}:${answer.sample}`,
    // The prompt text only groups rows per question; the index does that.
    prompt_text_snapshot: `q${answer.promptIndex}`,
    ...answer.row,
    extraction_error: null,
    brand_snapshot: brand,
    provider: answer.engine,
    extraction_version: EXTRACTION_VERSION
  };
}

function scoreOf(rows: ScoreInputRow[], domain: string): number | null {
  if (rows.length === 0) return null;
  return getEffectiveGeoScore(computeRunScoresFromResults(rows, domain));
}

export function scorePass(answers: CompareAnswer[], project: { brand: string; domain: string }): PassScore {
  const ok = answers.filter(isOk);
  const byEngine = {} as Record<CompareEngine, number | null>;
  const costPerAnswer = {} as Record<CompareEngine, number | null>;
  let cost = 0;
  let pricedAnswers = 0;
  for (const engine of COMPARE_ENGINES) {
    const engineAnswers = ok.filter((a) => a.engine === engine);
    byEngine[engine] = scoreOf(
      engineAnswers.map((a) => toScoreRow(a, project.brand)),
      project.domain
    );
    const costs = engineAnswers.map(answerCost).filter((c): c is number => c !== null);
    costPerAnswer[engine] = costs.length > 0 ? costs.reduce((s, c) => s + c, 0) / costs.length : null;
    cost += costs.reduce((s, c) => s + c, 0);
    pricedAnswers += costs.length;
  }
  return {
    overall: scoreOf(
      ok.map((a) => toScoreRow(a, project.brand)),
      project.domain
    ),
    byEngine,
    answered: ok.length,
    failed: answers.length - ok.length,
    cost,
    pricedAnswers,
    costPerAnswer
  };
}

// ---------------------------------------------------------------- agreement

/** Agreement between two passes on one engine, each figure 0–100, null when nothing to compare. */
export type PairMetrics = {
  pairs: number;
  /** Same yes/no on "the answer names the brand". */
  mention: number | null;
  /** Mean Jaccard of the brands each answer names (competitors + other brands). */
  competitors: number | null;
  /** Same sentiment, only over pairs where both answers name the brand. */
  sentiment: number | null;
  /** Mean Jaccard of the cited domains. Null for an engine that cites nothing by design (Claude). */
  sources: number | null;
};

function jaccard(left: string[], right: string[]): number {
  const a = new Set(left.map((s) => s.trim().toLowerCase()).filter(Boolean));
  const b = new Set(right.map((s) => s.trim().toLowerCase()).filter(Boolean));
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared += 1;
  return shared / (a.size + b.size - shared);
}

const pct = (value: number) => Math.round(value * 1000) / 10;
const mean = (values: number[]) => (values.length === 0 ? null : pct(values.reduce((s, v) => s + v, 0) / values.length));

/** Pairs answers of two passes by (question, repetition) on one engine. Failed answers pair with nothing. */
export function comparePasses(left: CompareAnswer[], right: CompareAnswer[], engine: CompareEngine): PairMetrics {
  const index = new Map<string, CompareAnswerOk>();
  for (const answer of right) {
    if (answer.engine === engine && isOk(answer)) index.set(`${answer.promptIndex}:${answer.sample}`, answer);
  }
  const mention: number[] = [];
  const competitors: number[] = [];
  const sentiment: number[] = [];
  const sources: number[] = [];
  for (const a of left) {
    if (a.engine !== engine || !isOk(a)) continue;
    const b = index.get(`${a.promptIndex}:${a.sample}`);
    if (!b) continue;
    mention.push(a.row.brand_mentioned === b.row.brand_mentioned ? 1 : 0);
    competitors.push(jaccard(a.namedBrands, b.namedBrands));
    if (a.row.brand_mentioned && b.row.brand_mentioned) sentiment.push(a.row.sentiment === b.row.sentiment ? 1 : 0);
    if (engine !== "claude") sources.push(jaccard(a.citedDomains, b.citedDomains));
  }
  return {
    pairs: mention.length,
    mention: mean(mention),
    competitors: mean(competitors),
    sentiment: mean(sentiment),
    sources: engine === "claude" ? null : mean(sources)
  };
}

// ---------------------------------------------------------------- verdict

export type Verdict = "equivalente" | "revisar" | "distinto" | "sin_datos";

/** How far below the noise an agreement may sit and still read as "the same". */
export const NOISE_MARGIN_POINTS = 5;
/** Minimum score tolerance, so a perfectly stable baseline does not make 0.5 points "distinto". */
export const MIN_SCORE_TOLERANCE = 2;
/** Without a noise pass: agreements from here up read as the same… */
export const FIXED_EQUIVALENT_AGREEMENT = 85;
/** …and below here as different. */
export const FIXED_DISTINCT_AGREEMENT = 70;
export const FIXED_SCORE_TOLERANCE = 3;

const METRIC_KEYS = ["mention", "competitors", "sentiment", "sources"] as const;

/**
 * Candidate (A vs B) against noise (A vs A2), when there is a noise pass:
 * equivalent if every agreement is within NOISE_MARGIN_POINTS of what the
 * same model achieves against itself and the score moves no more than the
 * noise did (with a floor); different past twice either tolerance.
 * Without a noise pass, fixed thresholds — stated on the page as such.
 */
export function decideVerdict(input: {
  candidate: PairMetrics;
  noise: PairMetrics | null;
  /** |score B − score A| */
  scoreDelta: number | null;
  /** |score A2 − score A|, null without a noise pass. */
  noiseScoreDelta: number | null;
}): Verdict {
  const { candidate, noise } = input;
  if (candidate.pairs === 0 || input.scoreDelta === null) return "sin_datos";

  let worstShortfall = 0;
  for (const key of METRIC_KEYS) {
    const value = candidate[key];
    if (value === null) continue;
    const reference = noise && noise.pairs > 0 ? noise[key] : null;
    const shortfall = reference !== null ? Math.max(0, reference - value) : null;
    if (noise && noise.pairs > 0) {
      if (shortfall !== null) worstShortfall = Math.max(worstShortfall, shortfall);
    } else {
      worstShortfall = Math.max(worstShortfall, FIXED_EQUIVALENT_AGREEMENT - value);
    }
  }

  if (noise && noise.pairs > 0) {
    const scoreTolerance = Math.max(input.noiseScoreDelta ?? 0, MIN_SCORE_TOLERANCE);
    if (worstShortfall > 2 * NOISE_MARGIN_POINTS || input.scoreDelta > 2 * scoreTolerance) return "distinto";
    if (worstShortfall <= NOISE_MARGIN_POINTS && input.scoreDelta <= scoreTolerance) return "equivalente";
    return "revisar";
  }

  const lowest = Math.min(...METRIC_KEYS.map((k) => candidate[k]).filter((v): v is number => v !== null));
  if (lowest < FIXED_DISTINCT_AGREEMENT || input.scoreDelta > 2 * FIXED_SCORE_TOLERANCE) return "distinto";
  if (worstShortfall <= 0 && input.scoreDelta <= FIXED_SCORE_TOLERANCE) return "equivalente";
  return "revisar";
}

// ---------------------------------------------------------------- summary

export type EngineSummary = {
  engine: CompareEngine;
  candidate: PairMetrics;
  noise: PairMetrics | null;
  scoreA: number | null;
  scoreA2: number | null;
  scoreB: number | null;
  verdict: Verdict;
};

export type CompareSummary = {
  passes: Record<ComparePass, PassScore | null>;
  engines: EngineSummary[];
  /** Projected cost of one real scan of this project per pass, from measured per-answer costs. */
  scanCost: Record<ComparePass, number | null>;
};

const absDelta = (x: number | null, y: number | null) => (x === null || y === null ? null : Math.round(Math.abs(x - y) * 10) / 10);

export function summarizeComparison(input: {
  answers: CompareAnswer[];
  project: { brand: string; domain: string };
  /** Engines the comparison ran. */
  engines: CompareEngine[];
  /** Answers per engine one real scan of this project produces (prompts × repetitions). */
  answersPerEngineInScan: number;
}): CompareSummary {
  const byPass = (pass: ComparePass) => input.answers.filter((a) => a.pass === pass);
  const passes = {} as Record<ComparePass, PassScore | null>;
  const scanCost = {} as Record<ComparePass, number | null>;
  for (const pass of COMPARE_PASSES) {
    const answers = byPass(pass);
    passes[pass] = answers.length > 0 ? scorePass(answers, input.project) : null;
    const score = passes[pass];
    if (!score) {
      scanCost[pass] = null;
      continue;
    }
    const perEngine = input.engines.map((e) => score.costPerAnswer[e]);
    scanCost[pass] = perEngine.some((c) => c === null)
      ? null
      : perEngine.reduce((s: number, c) => s + (c as number), 0) * input.answersPerEngineInScan;
  }

  const a = byPass("a");
  const a2 = byPass("a2");
  const b = byPass("b");
  const engines = input.engines.map((engine): EngineSummary => {
    const candidate = comparePasses(a, b, engine);
    const noise = a2.length > 0 ? comparePasses(a, a2, engine) : null;
    const scoreA = passes.a?.byEngine[engine] ?? null;
    const scoreA2 = passes.a2?.byEngine[engine] ?? null;
    const scoreB = passes.b?.byEngine[engine] ?? null;
    return {
      engine,
      candidate,
      noise,
      scoreA,
      scoreA2,
      scoreB,
      verdict: decideVerdict({
        candidate,
        noise,
        scoreDelta: absDelta(scoreB, scoreA),
        noiseScoreDelta: noise ? absDelta(scoreA2, scoreA) : null
      })
    };
  });

  return { passes, engines, scanCost };
}
