import { resolveCitation } from "@/lib/citations/aggregate-citations";
import { isSameOrSubdomain } from "@/lib/domains/brand-domain";
import type { OverviewAgenticCard } from "@/lib/agentic-audit/visibility-model";
import type { ReportAnswer, ReportModel } from "@/lib/report/report-model";

/**
 * CHROME-EXT-1 paso 02 — what the Chrome extension's panel shows of a
 * project (`docs/chrome-extension/task-intake-report.md` §18).
 *
 * Pure on purpose: every figure arrives already computed by its owner — the
 * Puntuación GEO, engines, rivals, technical score and plan from
 * `buildReportModel` over `loadReportInput` (the same loader as the
 * report, which itself takes each figure from the console's owner), the
 * agentic block from `overviewAgenticCard`. This module only picks fields
 * and renames them for the panel. Shares stay shares in [0, 1]: the panel
 * prints percentages, never counts (`.claude/rules/report.md`).
 */

export type ExtEngine = { provider: string; label: string; mentionShare: number };
export type ExtRival = { name: string; share: number; isBrand: boolean };
export type ExtPlanItem = { title: string; firstStep: string | null; engines: string[] };
export type ExtCitingPrompt = { text: string; engines: string[]; mentioned: boolean };
export type ExtAgentic =
  | { kind: "card"; score: number; headline: string; components: Array<{ name: string; points: number | null; weight: number }> }
  | { kind: "upsell" }
  | null;

export type ExtProjectSummary = {
  domain: string;
  brand: string;
  scanDate: string | null;
  geoScore: number | null;
  lede: string | null;
  engines: ExtEngine[];
  rivals: ExtRival[];
  seoScore: number | null;
  plan: ExtPlanItem[];
  agentic: ExtAgentic;
  /** Prompts of the latest scan whose answer cited the open page. Null when no url was asked for. */
  citingPrompts: ExtCitingPrompt[] | null;
};

/** The panel's rival list: the brand plus the four most named rivals. */
export const EXT_RIVALS = 4;
export const EXT_PLAN_ITEMS = 3;

export function toExtAgentic(card: OverviewAgenticCard): ExtAgentic {
  if (card.kind === "upsell") return { kind: "upsell" };
  if (card.kind !== "card") return null;
  return {
    kind: "card",
    score: card.score,
    headline: card.headline,
    components: card.components.map((c) => ({ name: c.name, points: c.points, weight: c.weight }))
  };
}

/** Same page, whatever the scheme, `www.`, trailing slash, query or fragment. */
export function pageKey(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.hostname.replace(/^www\./, "").toLowerCase()}${path}`;
  } catch {
    return null;
  }
}

/**
 * Prompts whose answer cited `url`. Citations go through `resolveCitation`,
 * the function Páginas citadas uses, so the panel and that screen agree on
 * what counts as a cited page.
 */
export function findCitingPrompts(
  answers: readonly ReportAnswer[],
  url: string,
  engineLabel: (provider: string) => string
): ExtCitingPrompt[] {
  const want = pageKey(url);
  if (!want) return [];
  const byPrompt = new Map<string, ExtCitingPrompt & { providers: Set<string> }>();
  for (const a of answers) {
    const ext = a.extracted as { citations?: unknown; brand?: { mentioned?: unknown } } | null;
    const citations = Array.isArray(ext?.citations) ? ext.citations : [];
    const cites = citations.some((c) => {
      const resolved = c && typeof c === "object" ? resolveCitation(c as Parameters<typeof resolveCitation>[0]) : null;
      return Boolean(resolved?.url) && pageKey(resolved!.url) === want;
    });
    if (!cites) continue;
    const entry = byPrompt.get(a.promptId) ?? { text: a.promptText, engines: [], mentioned: false, providers: new Set<string>() };
    if (a.provider && !entry.providers.has(a.provider)) {
      entry.providers.add(a.provider);
      entry.engines.push(engineLabel(a.provider));
    }
    if (ext?.brand?.mentioned === true) entry.mentioned = true;
    byPrompt.set(a.promptId, entry);
  }
  return [...byPrompt.values()].map(({ text, engines, mentioned }) => ({ text, engines, mentioned }));
}

export function buildExtProjectSummary({
  project,
  model,
  answers,
  agentic,
  url,
  engineLabel
}: {
  project: { domain: string; brand: string };
  model: ReportModel | null;
  answers: readonly ReportAnswer[];
  agentic: OverviewAgenticCard;
  url: string | null;
  engineLabel: (provider: string) => string;
}): ExtProjectSummary {
  const ownUrl = url && isOwnUrl(url, project.domain) ? url : null;
  return {
    domain: project.domain,
    brand: model?.brandName ?? project.brand,
    scanDate: model?.scanDate ?? null,
    geoScore: model?.geoScore ?? null,
    lede: model?.summary.lede ?? null,
    engines: (model?.engines ?? []).map((e) => ({ provider: e.provider, label: e.label, mentionShare: e.mentionShare })),
    rivals: pickRivals(model),
    seoScore: model?.technical?.score ?? null,
    plan: (model?.plan ?? []).slice(0, EXT_PLAN_ITEMS).map((p) => ({ title: p.title, firstStep: p.firstStep, engines: p.engineLabels })),
    agentic: toExtAgentic(agentic),
    citingPrompts: ownUrl ? findCitingPrompts(answers, ownUrl, engineLabel) : null
  };
}

function isOwnUrl(url: string, domain: string): boolean {
  try {
    return isSameOrSubdomain(new URL(url).hostname, domain);
  } catch {
    return false;
  }
}

/** The brand always stays in the list, even when it is not in the top four. */
function pickRivals(model: ReportModel | null): ExtRival[] {
  const bars = model?.competition.bars ?? [];
  const top = bars.filter((b) => !b.isBrand).slice(0, EXT_RIVALS);
  const brand = bars.find((b) => b.isBrand);
  return [...top, ...(brand ? [brand] : [])]
    .sort((a, b) => b.share - a.share)
    .map((b) => ({ name: b.name, share: b.share, isBrand: b.isBrand }));
}
