import { getEngineMeta, normalizeProvider } from "@/lib/scan/engine-meta";

/**
 * Pure aggregation over scan_prompt_results rows for the Citations page.
 * Extracted from app/dashboard/projects/[projectId]/citations/page.tsx
 * (ENGINES-VALUE-2, docs/specs/engines-value-2.md) so the ~150-line
 * dedup/categorization logic is unit-testable and gains a per-engine
 * attribution dimension without risking a silent regression in the
 * existing aggregates (dedup by grounding domain, inline-by-URL,
 * brand/competitor/third_party categories, brandMentioned yes/no/na).
 *
 * No I/O, no "server-only" — consumed by the server page component; types
 * are also consumed by the client component (citations-client.tsx), which
 * imports from here and never the other way around (no circular import).
 */

export type CitationCategory = "brand" | "competitor" | "third_party";

/** Per-engine cite count for a single cited domain/URL. */
export type CitationEngine = {
  /** Already normalized (null → "gemini"). */
  provider: string;
  cited: number;
};

export type CitationRow = {
  id: string;
  title: string;
  url: string;
  domain: string;
  category: CitationCategory;
  brandMentioned: "yes" | "no" | "na";
  competitors: string[];
  cited: number;
  prompts: Array<{ text: string; brandMentioned: boolean }>;
  /** Order: grounded engines first, then cited desc. Never invented. */
  engines: CitationEngine[];
};

export type PromptCitation = {
  title: string;
  url: string;
  domain: string;
  category: CitationCategory;
  cited: number;
  /** Order: grounded engines first, then cited desc. Never invented. */
  engines: CitationEngine[];
};

export type PromptGroup = {
  id: string;
  promptText: string;
  topic: string | null;
  brandMentioned: boolean;
  citations: PromptCitation[];
  citedUrls: number;
  totalCites: number;
};

/** Per grounded engine present in the run: distinct domains + total cites. */
export type EngineTotal = {
  provider: string;
  domains: number;
  cites: number;
};

export type CitationInputRow = {
  prompt_id: string | null;
  prompt_text_snapshot: string | null;
  brand_mentioned: boolean | null;
  extracted_json: unknown;
  provider: string | null;
};

type ExtractedJson = {
  brand?: { mentioned?: boolean };
  competitors?: Array<{ name?: string; mentioned?: boolean }>;
  citations?: Array<{
    url?: string | null;
    domain?: string | null;
    title?: string | null;
    source?: "grounding" | "inline";
  }>;
};

type Citation = NonNullable<ExtractedJson["citations"]>[number];

function parseExt(raw: unknown): ExtractedJson {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as ExtractedJson;
}

export function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

export function isSameOrSubdomain(domain: string, root: string): boolean {
  if (!domain || !root) return false;
  return domain === root || domain.endsWith(`.${root}`);
}

/**
 * Resolves a single raw citation into its display/dedup identity.
 *
 * Per docs/adr/0006-grounding-redirect-resolution.md, the raw
 * vertexaisearch.cloud.google.com redirect (`citation.url` for
 * source: "grounding") must never be shown or used as a dedup key — multiple
 * grounding chunks resolving to the same domain are the same cited page and
 * must aggregate into one entry, not one per ephemeral redirect. Inline
 * citations keep their real URL as both display and key since each one is a
 * distinct, genuine page link.
 */
export function resolveCitation(
  citation: Citation
): { key: string; title: string; url: string; domain: string } | null {
  const rawDomain = citation.domain?.trim();

  if (citation.source === "grounding") {
    if (rawDomain) {
      const domain = normalizeDomain(rawDomain);
      return { key: domain, title: citation.title?.trim() || domain, url: "", domain };
    }
    const label = citation.title?.trim() || "Fuente sin resolver";
    return { key: `unresolved:${label.toLowerCase()}`, title: label, url: "", domain: "" };
  }

  const inlineUrl = citation.url?.trim();
  const domain = rawDomain ? normalizeDomain(rawDomain) : "";
  if (!inlineUrl && !domain) return null;
  const key = (inlineUrl ?? domain).toLowerCase();
  return { key, title: citation.title?.trim() || inlineUrl || domain, url: inlineUrl ?? "", domain };
}

/**
 * Sorts a provider→count map into the display order used across the app:
 * grounded engines first (ENGINES-VALUE-1 convention), then cited desc.
 * Claude (never grounded) never has citations by construction (no web
 * search), so in practice this only ever orders gemini/openai — but the
 * rule is general so a future non-grounded engine with a citation bug
 * doesn't silently jump ahead of a grounded one.
 */
function sortEngines(counts: Map<string, number>): CitationEngine[] {
  return Array.from(counts.entries())
    .map(([provider, cited]) => ({ provider, cited }))
    .sort((a, b) => {
      const groundedDiff = Number(getEngineMeta(b.provider).grounded) - Number(getEngineMeta(a.provider).grounded);
      if (groundedDiff !== 0) return groundedDiff;
      return b.cited - a.cited;
    });
}

/**
 * Comparator for ranking opportunity rows (third-party domains the brand
 * doesn't appear in): domains cited by more distinct engines rank first
 * ("Reddit cited by Gemini AND ChatGPT" outranks "cited by only one"), then
 * by total cited count. Exported so page.tsx's opportunityRows sort and
 * this module's tests share a single implementation.
 */
export function compareOpportunityRows(a: CitationRow, b: CitationRow): number {
  return b.engines.length - a.engines.length || b.cited - a.cited;
}

export function aggregateCitations(input: {
  rows: CitationInputRow[];
  /** Raw, normalized inside. */
  projectDomain: string;
  /** Already-normalized domains (same contract as the caller today). */
  competitorDomains: Array<{ name: string; domain: string }>;
  promptCategoryMap: Map<string, string | null>;
}): {
  citationRows: CitationRow[];
  promptGroups: PromptGroup[];
  hasStructuredCitations: boolean;
  engineTotals: EngineTotal[];
} {
  const { rows, competitorDomains, promptCategoryMap } = input;
  const projectDomain = normalizeDomain(input.projectDomain ?? "");

  type Agg = {
    id: string;
    title: string;
    url: string;
    domain: string;
    category: CitationCategory;
    cited: number;
    brandMentionedYes: number;
    brandMentionedNo: number;
    competitors: Set<string>;
    prompts: Array<{ text: string; brandMentioned: boolean }>;
    engines: Map<string, number>;
  };

  type PromptGroupAgg = {
    promptId: string;
    promptText: string;
    topic: string | null;
    brandMentioned: boolean;
    citations: Map<
      string,
      { title: string; url: string; domain: string; category: CitationCategory; cited: number; engines: Map<string, number> }
    >;
  };

  const agg = new Map<string, Agg>();
  const promptGroupsAgg = new Map<string, PromptGroupAgg>();
  const engineTotalsAgg = new Map<string, { domains: Set<string>; cites: number }>();
  let hasStructuredCitations = false;

  for (const result of rows) {
    const ext = parseExt(result.extracted_json);
    const promptText = result.prompt_text_snapshot ?? "";
    const brandMentioned = Boolean(result.brand_mentioned);
    const provider = normalizeProvider(result.provider);
    const mentionedCompetitors = (ext.competitors ?? [])
      .filter((c) => c.mentioned && c.name)
      .map((c) => c.name as string);

    const groupKey = result.prompt_id ?? `text:${promptText.toLowerCase()}`;
    let group = promptGroupsAgg.get(groupKey);
    if (!group) {
      group = {
        promptId: groupKey,
        promptText,
        topic: result.prompt_id ? promptCategoryMap.get(result.prompt_id) ?? null : null,
        brandMentioned: false,
        citations: new Map()
      };
      promptGroupsAgg.set(groupKey, group);
    }
    if (brandMentioned) group.brandMentioned = true;

    for (const citation of ext.citations ?? []) {
      const resolved = resolveCitation(citation);
      if (!resolved) continue;
      const { key, title, url, domain } = resolved;

      hasStructuredCitations = true;

      let category: CitationCategory = "third_party";
      if (domain) {
        if (isSameOrSubdomain(domain, projectDomain)) {
          category = "brand";
        } else if (competitorDomains.some((c) => isSameOrSubdomain(domain, c.domain))) {
          category = "competitor";
        }
      }

      let row = agg.get(key);
      if (!row) {
        row = {
          id: key,
          title,
          url,
          domain,
          category,
          cited: 0,
          brandMentionedYes: 0,
          brandMentionedNo: 0,
          competitors: new Set(),
          prompts: [],
          engines: new Map()
        };
        agg.set(key, row);
      }

      row.cited += 1;
      if (brandMentioned) row.brandMentionedYes += 1;
      else row.brandMentionedNo += 1;
      for (const name of mentionedCompetitors) row.competitors.add(name);
      row.prompts.push({ text: promptText, brandMentioned });
      row.engines.set(provider, (row.engines.get(provider) ?? 0) + 1);

      let groupCitation = group.citations.get(key);
      if (!groupCitation) {
        groupCitation = { title, url, domain, category, cited: 0, engines: new Map() };
        group.citations.set(key, groupCitation);
      }
      groupCitation.cited += 1;
      groupCitation.engines.set(provider, (groupCitation.engines.get(provider) ?? 0) + 1);

      // engineTotals is scoped to grounded engines only — a non-grounded
      // engine (Claude) never produces real citation evidence (docs/adr/
      // 0012-grounding-aware-citation-score.md), so it must never appear
      // here even if a future bug somehow attached a citation to it.
      if (getEngineMeta(provider).grounded) {
        let engineTotal = engineTotalsAgg.get(provider);
        if (!engineTotal) {
          engineTotal = { domains: new Set(), cites: 0 };
          engineTotalsAgg.set(provider, engineTotal);
        }
        engineTotal.cites += 1;
        if (domain) engineTotal.domains.add(domain);
      }
    }
  }

  const citationRows: CitationRow[] = Array.from(agg.values())
    .map((row) => ({
      id: row.id,
      title: row.title,
      url: row.url,
      domain: row.domain,
      category: row.category,
      brandMentioned: (row.category === "brand"
        ? "na"
        : row.brandMentionedYes > 0
          ? "yes"
          : "no") as CitationRow["brandMentioned"],
      competitors: Array.from(row.competitors),
      cited: row.cited,
      prompts: row.prompts,
      engines: sortEngines(row.engines)
    }))
    .sort((a, b) => b.cited - a.cited);

  const promptGroups: PromptGroup[] = Array.from(promptGroupsAgg.values())
    .map((group) => {
      const citations = Array.from(group.citations.values())
        .map((c) => ({
          title: c.title,
          url: c.url,
          domain: c.domain,
          category: c.category,
          cited: c.cited,
          engines: sortEngines(c.engines)
        }))
        .sort((a, b) => b.cited - a.cited);
      return {
        id: group.promptId,
        promptText: group.promptText,
        topic: group.topic,
        brandMentioned: group.brandMentioned,
        citations,
        citedUrls: citations.length,
        totalCites: citations.reduce((sum, c) => sum + c.cited, 0)
      };
    })
    .sort((a, b) => b.totalCites - a.totalCites);

  // Canonical provider order (matches lib/scan/engine-meta.ts's ENGINE_META
  // key order) so "Gemini N · ChatGPT M" always renders in the same order
  // regardless of which engine's rows happened to be processed first.
  const providerOrder = ["gemini", "claude", "openai"];
  const engineTotals: EngineTotal[] = Array.from(engineTotalsAgg.entries())
    .map(([provider, totals]) => ({
      provider,
      domains: totals.domains.size,
      cites: totals.cites
    }))
    .sort((a, b) => providerOrder.indexOf(a.provider) - providerOrder.indexOf(b.provider));

  return { citationRows, promptGroups, hasStructuredCitations, engineTotals };
}
