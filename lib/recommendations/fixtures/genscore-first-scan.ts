/**
 * Synthetic reproduction of the first scan of genscore.es (the findings of the
 * "unproven recommendations" audit, 2026-10-08). It is NOT a dump of real data
 * — no production row was read to build it. It reproduces the *shape* that
 * produced the five findings:
 *
 *  - every prompt at 0% (brand mentioned nowhere, no own-domain citation);
 *  - one prompt ("¿Es rentable invertir…?") with 6 answers (3 engines × 2
 *    samples) that names NO tracked competitor but lists many grounded sources
 *    and two real brands the project does not monitor (Ahrefs, Moz);
 *  - brand-absent informational prompts, so the FAQ rule fires with no quote;
 *  - a comparative pair where a tracked competitor (Profound) does appear.
 *
 * Test-only. Nothing here is ever written to a database.
 */
import type { generateRecommendationsForRun } from "../recommendation-engine";

export type FixturePromptResult = Parameters<typeof generateRecommendationsForRun>[0]["promptResults"][number];

export const GENSCORE_PROJECT = { brand: "GenScore", domain: "genscore.es", country: "ES", language: "es" };

export const GENSCORE_TRACKED_COMPETITORS = ["Profound", "Otterly.AI", "Peec AI", "Semrush"];

export const PROFITABLE_PROMPT = "¿Es rentable invertir en una herramienta de GEO?";

const PROVIDERS = ["gemini", "claude", "openai"] as const;

const SOURCE_DOMAINS = [
  "xataka.com",
  "genbeta.com",
  "reddit.com",
  "ocu.org",
  "hubspot.es",
  "marketingdirecto.com",
  "40defiebre.com",
  "searchenginejournal.com",
  "semrush.com",
  "ahrefs.com",
  "moz.com",
  "econsultancy.com"
];

function trackedCompetitorsNotMentioned() {
  return GENSCORE_TRACKED_COMPETITORS.map((name) => ({ name, mentioned: false, evidence: [], position: null }));
}

function extracted(opts: {
  competitors?: Array<{ name: string; mentioned: boolean; evidence?: string[]; position?: number | null }>;
  domains?: string[];
  otherBrands?: string[];
}) {
  return {
    brand: { mentioned: false, evidence: [], position: null },
    competitors: opts.competitors ?? trackedCompetitorsNotMentioned(),
    citations: (opts.domains ?? []).map((domain) => ({
      domain,
      source: "grounding" as const,
      title: `Guía en ${domain}`,
      url: `https://${domain}/guia-geo`
    })),
    sentiment_drivers: [],
    other_brands_mentioned: opts.otherBrands ?? []
  };
}

function row(
  id: string,
  promptId: string,
  text: string,
  category: string,
  provider: string,
  extractedJson: unknown,
  competitorsMentioned = 0
): FixturePromptResult {
  return {
    id,
    promptId,
    prompt_text_snapshot: text,
    category,
    provider,
    brand_mentioned: false,
    citation_found: false,
    mentioned_competitors_count: competitorsMentioned,
    citations_count: 0,
    sentiment: "unknown",
    extracted_json: extractedJson,
    raw_response_text: null
  };
}

export function genscoreFirstScanResults(): FixturePromptResult[] {
  const rows: FixturePromptResult[] = [];

  // P1 — 6 answers: no tracked competitor, many sources, two unmonitored brands.
  PROVIDERS.forEach((provider, i) => {
    for (const sample of [0, 1]) {
      rows.push(
        row(
          `p1-${provider}-${sample}`,
          "prompt-1",
          PROFITABLE_PROMPT,
          "Precio y planes",
          provider,
          extracted({
            domains: SOURCE_DOMAINS.slice(i * 4, i * 4 + 4 + sample),
            otherBrands: sample === 0 ? ["Ahrefs", "Moz"] : ["Ahrefs"]
          })
        )
      );
    }
  });

  // P2 — a bare absence: no sources, no brands, nothing at all.
  for (const sample of [0, 1]) {
    rows.push(
      row(`p2-${sample}`, "prompt-2", "¿Cuánto cuesta una herramienta de seguimiento GEO?", "Precio y planes", "gemini", extracted({}))
    );
  }

  // P3, P4 — informational (the FAQ rule's input), brand absent, no quote.
  for (const sample of [0, 1]) {
    rows.push(
      row(`p3-${sample}`, "prompt-3", "¿Cómo mejorar mi visibilidad en ChatGPT?", "Cómo hacer / guía", "gemini", extracted({}))
    );
    rows.push(
      row(`p4-${sample}`, "prompt-4", "¿Cómo medir si la IA cita mi web?", "Cómo hacer / guía", "gemini", extracted({}))
    );
  }

  // P5, P6 — comparative: a tracked competitor does appear.
  const profound = (quote: string) => [
    { name: "Profound", mentioned: true, evidence: [quote], position: 1 },
    ...GENSCORE_TRACKED_COMPETITORS.filter((n) => n !== "Profound").map((name) => ({
      name,
      mentioned: false,
      evidence: [],
      position: null
    }))
  ];
  rows.push(
    row("p5-0", "prompt-5", "GenScore vs Profound", "Comparación", "gemini", extracted({ competitors: profound("Profound lidera el seguimiento GEO para empresas") }), 1)
  );
  rows.push(
    row("p6-0", "prompt-6", "Mejores alternativas a Profound", "Alternativas", "gemini", extracted({ competitors: profound("Profound es la referencia del sector") }), 1)
  );

  return rows;
}

export const GENSCORE_RUN_SCORE = {
  visibility_score: 0,
  citation_score: 0,
  competitor_gap_score: 20,
  confidence: "high" as const,
  details_json: {}
};

export function genscoreInput(competitors: string[] = GENSCORE_TRACKED_COMPETITORS) {
  return {
    project: GENSCORE_PROJECT,
    competitors,
    runScore: GENSCORE_RUN_SCORE,
    promptResults: genscoreFirstScanResults()
  };
}
