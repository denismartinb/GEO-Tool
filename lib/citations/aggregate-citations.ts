import { getEngineMeta, normalizeProvider } from "@/lib/scan/engine-meta";
import { isBrandDomain, isSameOrSubdomain, normalizeDomain } from "@/lib/domains/brand-domain";
import { classifySourceType, SOURCE_TYPE_LABEL, type SourceType } from "@/lib/citations/source-type";

// Re-exported so existing importers of these helpers keep working while
// lib/domains/brand-domain.ts stays the single definition (BRAND-DOMAIN-1).
export { isSameOrSubdomain, normalizeDomain };

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
  /**
   * Tracked competitors named in the ANSWERS this page was cited in — never
   * a claim about what the page itself says. `citation.source === "grounding"`
   * only tells us the model consulted this page while composing an answer
   * that happened to also name a competitor; nothing here reads the page
   * (CITATIONS-HONESTY-1, P0-09). Rendering this as "cites a rival" was the
   * exact overstatement the external audit flagged: two independent facts —
   * "the model used this source" and "the model named a competitor" — were
   * being collapsed into one about the page's content. Never gate an
   * outreach recommendation on this field; see `groupOpportunitiesByDomain`.
   */
  competitors: string[];
  /** Untracked brands named in the answers this page was cited in — same
   * unverified, answer-level signal as `competitors` above. */
  otherBrands: string[];
  cited: number;
  /** One entry per (prompt, provider) that cited this page. `rawResponseText`
   * is the model's actual answer to that prompt — the real "why was this
   * cited" evidence, not a fabricated excerpt. `null` for rows persisted
   * before raw_response_text was selected on this page's query.
   * `competitors`/`otherBrands` are scoped to THIS specific (prompt,
   * provider) result — unlike the row-level `competitors`/`otherBrands`
   * above, which are unioned across every prompt that ever cited this page.
   * A row can be classified "adverse" (cites a competitor) from ONE
   * prompt's extraction while most of its other prompts mention no brand at
   * all; showing the per-entry names is what lets a founder looking at the
   * expanded evidence actually see WHICH answer backs that classification,
   * instead of a row-level claim with no visible attribution. */
  prompts: Array<{
    text: string;
    brandMentioned: boolean;
    provider: string;
    rawResponseText: string | null;
    competitors: string[];
    otherBrands: string[];
  }>;
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

/**
 * "Impact" of the citations, per Semrush's first-party/third-party framing
 * ("What Are AI Citations & How Do I Get Them?", 30 jul 2025): a third-party
 * citation is not neutral — it matters whether the same answer also
 * mentioned the brand ("favorable" exposure, using our existing
 * brand-mention signal as the honest proxy we have — this is presence, not
 * verified sentiment) or a tracked competitor instead ("adverse").
 * `own`/`competitor` reuse the existing category split; `favorable`/
 * `adverse`/`neutral` only apply to third_party rows, using the same
 * row-level `brandMentioned`/`competitors` signal CitationRow already
 * exposes. A row's FULL cited count is attributed to a single bucket based
 * on that page's aggregate signal across the prompts that cited it — not
 * resolved per individual citation event, since we don't track
 * brand/competitor mentions at that granularity. Totals still sum to
 * `totalCited` ("share of the 1,284 citations"), just bucketed per page
 * rather than per citation event.
 */
export type ImpactBreakdown = {
  own: number;
  favorable: number;
  adverse: number;
  otherBrands: number;
  competitor: number;
  neutral: number;
};

/** One slice of the source-type donut: a classifySourceType bucket, plus the
 * two category-derived pseudo-types (own/competitor), with its share of
 * total cited count. */
export type SourceTypeSlice = {
  type: SourceType | "own" | "competitor";
  label: string;
  cited: number;
  pct: number;
};

export type CitationInputRow = {
  prompt_id: string | null;
  prompt_text_snapshot: string | null;
  brand_mentioned: boolean | null;
  extracted_json: unknown;
  provider: string | null;
  raw_response_text: string | null;
};

type ExtractedJson = {
  brand?: { mentioned?: boolean };
  competitors?: Array<{ name?: string; mentioned?: boolean }>;
  /** Brands the AI named that are NEITHER the project brand NOR a tracked
   * competitor (lib/extraction/schema.ts). Lets the impact split tell
   * "cited a page that pushes some other brand" apart from "cited a page
   * that named nobody at all" — two very different situations that both
   * used to collapse into a single "neutral" bucket. */
  other_brands_mentioned?: string[];
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

/**
 * True when `url`'s host genuinely belongs to `domain` — i.e. `url` is the
 * real destination page, not a redirect wrapper on a different host.
 *
 * This is what separates the two providers that both persist
 * `source: "grounding"` citations (lib/scan/extraction.ts): Gemini's
 * `citation.url` is ALWAYS the raw vertexaisearch.cloud.google.com redirect
 * (never the resolved destination — only `citation.domain` gets resolved,
 * per docs/adr/0006), while OpenAI's `url_citation` annotations are already
 * the final page URL (lib/llm/openai.ts, `groundingUrlsAreFinal`), so its
 * host matches `domain` and this returns true.
 */
function isRealDestinationUrl(url: string, domain: string): boolean {
  try {
    const host = normalizeDomain(new URL(url).hostname);
    return isSameOrSubdomain(host, domain) || isSameOrSubdomain(domain, host);
  } catch {
    return false;
  }
}

/**
 * Resolves a single raw citation into its display/dedup identity.
 *
 * Per docs/adr/0006-grounding-redirect-resolution.md, the raw
 * vertexaisearch.cloud.google.com redirect must never be shown or used as a
 * dedup key — multiple Gemini grounding chunks resolving to the same domain
 * are the same cited page and must aggregate into one entry, not one per
 * ephemeral redirect. That rule was previously applied to EVERY
 * source: "grounding" citation regardless of provider, which also discarded
 * OpenAI's `citation.url` — already a real, final page URL, never a
 * redirect (CITATIONS-REDESIGN-1). `isRealDestinationUrl` tells the two
 * apart: a real per-page URL is kept and used as the dedup key (same rule
 * inline citations already follow below), so distinct OpenAI-cited pages on
 * the same domain don't collapse into one row; a redirect-only citation
 * (Gemini) keeps the prior domain-level dedup, unchanged.
 */
export function resolveCitation(
  citation: Citation
): { key: string; title: string; url: string; domain: string } | null {
  const rawDomain = citation.domain?.trim();

  if (citation.source === "grounding") {
    if (rawDomain) {
      const domain = normalizeDomain(rawDomain);
      const rawUrl = citation.url?.trim();
      const url = rawUrl && isRealDestinationUrl(rawUrl, domain) ? rawUrl : "";
      const key = url || domain;
      return { key, title: citation.title?.trim() || url || domain, url, domain };
    }
    const label = citation.title?.trim() || "Fuente sin resolver";
    return { key: `unresolved:${label.toLowerCase()}`, title: label, url: "", domain: "" };
  }

  const inlineUrl = citation.url?.trim();
  const domain = rawDomain ? normalizeDomain(rawDomain) : "";
  if (!inlineUrl && !domain) return null;

  // Inline citations are heuristically extracted from the model's own
  // answer text and never count toward citation_found/citations_count (see
  // the "Anti-fake invariant" comment in lib/scan/extraction.ts) — so they
  // can pick up an incidental link the model wrote next to a business-name
  // mention rather than a real source page, most often a Google Maps/Search
  // URL (e.g. "BANNI" → google.com/maps/search/BANNI...). That's not a
  // genuine citation and never an actionable outreach target, so it's
  // excluded from the Citations page entirely (founder review 2026-07-19).
  // Grounding citations (real web_search/Search results, which DO count
  // toward citation_score) are handled above and never reach this branch,
  // so this only ever filters the noisy heuristic inline path.
  if (domain && isSameOrSubdomain(domain, "google.com")) return null;

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

/**
 * One outreach-eligible domain, grouped from its individual cited pages.
 * CITATIONS-HONESTY-1 (P0-09): the previous "Oportunidades" list qualified a
 * row by whether a tracked competitor happened to be named in the same
 * answer — a fact about the ANSWER, not the page, and the report flagged it
 * as an overstatement. A domain now qualifies for outreach on a checkable
 * fact instead: the AI cites it and the brand's own domain is absent from
 * those answers (see the `reachable` filter callers apply before grouping).
 * `coCitedCompetitors` keeps the competitor signal — it's still real,
 * useful context — but demoted to a labeled, unverified aside rather than
 * the qualifying reason, and grouped so a project with many long-tail URLs
 * on the same domain reads as one prioritizable target, not one row per URL.
 */
export type OpportunityDomainGroup = {
  domain: string;
  /** Distinct cited pages under this domain, most-cited first. */
  pages: CitationRow[];
  /** Sum of `cited` across every page in this domain — the group's frequency. */
  totalCited: number;
  /** Order: grounded engines first, then cited desc. Never invented. */
  engines: CitationEngine[];
  /** Distinct prompt texts across every page in this domain. */
  promptTexts: string[];
  /**
   * Union of tracked competitors named in ANY answer that cited a page in
   * this domain. Same-answer co-occurrence only — never verified against the
   * page's own content. Render with an explicit "sin verificar" qualifier,
   * never as a claim about what the domain publishes.
   */
  coCitedCompetitors: string[];
};

/**
 * Groups already-filtered outreach-eligible rows (see page.tsx's
 * `opportunityRows`) by domain, for the priority list the external audit
 * asked for (Fase 8, deliverable 5): frequency, engines, and associated
 * queries per domain instead of one row per URL. A domain publishing many
 * distinct cited pages (e.g. a comparator with several product reviews)
 * reads as one prioritizable outreach target with N pages, not N
 * indistinguishable rows.
 */
export function groupOpportunitiesByDomain(rows: CitationRow[]): OpportunityDomainGroup[] {
  type Group = {
    pages: CitationRow[];
    engines: Map<string, number>;
    prompts: Set<string>;
    competitors: Set<string>;
  };
  const byDomain = new Map<string, Group>();

  for (const row of rows) {
    const key = row.domain || row.title;
    let group = byDomain.get(key);
    if (!group) {
      group = { pages: [], engines: new Map(), prompts: new Set(), competitors: new Set() };
      byDomain.set(key, group);
    }
    group.pages.push(row);
    for (const e of row.engines) group.engines.set(e.provider, (group.engines.get(e.provider) ?? 0) + e.cited);
    for (const p of row.prompts) group.prompts.add(p.text);
    for (const c of row.competitors) group.competitors.add(c);
  }

  return Array.from(byDomain.entries())
    .map(([domain, group]) => {
      const pages = group.pages.slice().sort((a, b) => b.cited - a.cited);
      return {
        domain,
        pages,
        totalCited: pages.reduce((sum, p) => sum + p.cited, 0),
        engines: sortEngines(group.engines),
        promptTexts: Array.from(group.prompts),
        coCitedCompetitors: Array.from(group.competitors)
      };
    })
    .sort((a, b) => b.engines.length - a.engines.length || b.totalCited - a.totalCited);
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
  impactBreakdown: ImpactBreakdown;
  sourceTypeBreakdown: SourceTypeSlice[];
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
    otherBrands: Set<string>;
    prompts: Array<{
      text: string;
      brandMentioned: boolean;
      provider: string;
      rawResponseText: string | null;
      competitors: string[];
      otherBrands: string[];
    }>;
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
    const mentionedOtherBrands = (ext.other_brands_mentioned ?? []).filter(
      (name): name is string => typeof name === "string" && name.trim().length > 0
    );

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
        // Brand-level ownership (BRAND-DOMAIN-1): an ikea.com citation on an
        // ikea.es project is the brand's, not a third party. Same rule for
        // tracked competitors, so conforama.com counts for conforama.es.
        if (isBrandDomain(domain, projectDomain)) {
          category = "brand";
        } else if (competitorDomains.some((c) => isBrandDomain(domain, c.domain))) {
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
          otherBrands: new Set(),
          prompts: [],
          engines: new Map()
        };
        agg.set(key, row);
      }

      row.cited += 1;
      if (brandMentioned) row.brandMentionedYes += 1;
      else row.brandMentionedNo += 1;
      for (const name of mentionedCompetitors) row.competitors.add(name);
      for (const name of mentionedOtherBrands) row.otherBrands.add(name);
      row.prompts.push({
        text: promptText,
        brandMentioned,
        provider,
        rawResponseText: result.raw_response_text,
        competitors: mentionedCompetitors,
        otherBrands: mentionedOtherBrands
      });
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
      otherBrands: Array.from(row.otherBrands),
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

  const impactBreakdown: ImpactBreakdown = {
    own: 0,
    favorable: 0,
    adverse: 0,
    otherBrands: 0,
    competitor: 0,
    neutral: 0
  };
  const sourceTypeCited = new Map<SourceTypeSlice["type"], number>();

  for (const row of citationRows) {
    let bucket: keyof ImpactBreakdown;
    let typeKey: SourceTypeSlice["type"];

    if (row.category === "brand") {
      bucket = "own";
      typeKey = "own";
    } else if (row.category === "competitor") {
      bucket = "competitor";
      typeKey = "competitor";
    } else if (row.brandMentioned === "yes") {
      bucket = "favorable";
      typeKey = classifySourceType(row.domain);
    } else if (row.competitors.length > 0) {
      bucket = "adverse";
      typeKey = classifySourceType(row.domain);
    } else if (row.otherBrands.length > 0) {
      // Named some brand, just not one we track. Materially different from
      // "named nobody": these pages ARE pushing somebody, they're simply
      // pushing a company outside the tracked competitor set.
      bucket = "otherBrands";
      typeKey = classifySourceType(row.domain);
    } else {
      bucket = "neutral";
      typeKey = classifySourceType(row.domain);
    }

    impactBreakdown[bucket] += row.cited;
    sourceTypeCited.set(typeKey, (sourceTypeCited.get(typeKey) ?? 0) + row.cited);
  }

  const sourceTypeTotal = Array.from(sourceTypeCited.values()).reduce((sum, n) => sum + n, 0);
  const sourceTypeBreakdown: SourceTypeSlice[] = Array.from(sourceTypeCited.entries())
    .map(([type, cited]) => ({
      type,
      label: type === "own" ? "Tuyas" : type === "competitor" ? "Competidores" : SOURCE_TYPE_LABEL[type],
      cited,
      pct: sourceTypeTotal > 0 ? Math.round((cited / sourceTypeTotal) * 100) : 0
    }))
    .sort((a, b) => b.cited - a.cited);

  return { citationRows, promptGroups, hasStructuredCitations, engineTotals, impactBreakdown, sourceTypeBreakdown };
}
