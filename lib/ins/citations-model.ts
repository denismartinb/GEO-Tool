import { classifySourceType, SOURCE_TYPE_LABEL } from "@/lib/citations/source-type";
import type { CitationCategory, CitationRow, OpportunityDomainGroup } from "@/lib/citations/aggregate-citations";
import { fold } from "@/lib/ins/prompts-model";

/**
 * Páginas citadas in the «Instrumento» system (CONSOLE-INSTRUMENTO-1 F5c,
 * log §362). Pure: it reshapes what `aggregateCitations` already computed.
 * «Te nombran» is a fact about the ANSWER where the page was cited, never about
 * the page (.claude/rules/citations.md); nothing here reads a page.
 */

export type CitationTab = "Todas" | "Tuyas" | "Competidores" | "Terceros";
export const CITATION_TABS: CitationTab[] = ["Todas", "Tuyas", "Competidores", "Terceros"];

export type PageItem = {
  id: string;
  title: string;
  url: string;
  domain: string;
  cited: number;
  category: CitationCategory;
  /** Badge text: «Tuya», «Competidor» or the source family of the domain. */
  typeLabel: string;
};

export type OriginKey = "own" | "named" | "competitor" | "other";

export type OriginGroup = {
  key: OriginKey;
  label: string;
  description: string;
  /** Distinct pages in the group. */
  pages: number;
  /** Share of distinct cited pages, whole numbers summing to 100. */
  percent: number;
  /** The page-list tab this group opens. */
  tab: CitationTab;
};

export type ReachItem = {
  domain: string;
  cites: number;
  pages: number;
  engines: string[];
  prompts: string[];
  coCited: string[];
};

export function toPageItems(rows: CitationRow[]): PageItem[] {
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    domain: r.domain,
    cited: r.cited,
    category: r.category,
    typeLabel:
      r.category === "brand"
        ? "Tuya"
        : r.category === "competitor"
          ? "Competidor"
          : SOURCE_TYPE_LABEL[classifySourceType(r.domain)],
  }));
}

export function toReachItems(groups: OpportunityDomainGroup[]): ReachItem[] {
  return groups.map((g) => ({
    domain: g.domain,
    cites: g.totalCited,
    pages: g.pages.length,
    engines: g.engines.map((e) => e.provider),
    prompts: g.promptTexts,
    coCited: g.coCitedCompetitors,
  }));
}

/** Whole-number shares that add up to exactly 100 (largest remainder). */
export function percentShares(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return counts.map(() => 0);
  const exact = counts.map((c) => (c / total) * 100);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, r: v - Math.floor(v) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}

export function buildOrigins(rows: Array<Pick<CitationRow, "category" | "brandMentioned">>, brandDomain: string): OriginGroup[] {
  const own = rows.filter((r) => r.category === "brand").length;
  const competitor = rows.filter((r) => r.category === "competitor").length;
  const named = rows.filter((r) => r.category === "third_party" && r.brandMentioned === "yes").length;
  const other = rows.length - own - competitor - named;
  const pct = percentShares([own, named, competitor, other]);
  return [
    { key: "own", label: "Tuyas", description: `Páginas de ${brandDomain}.`, pages: own, percent: pct[0], tab: "Tuyas" },
    {
      key: "named",
      label: "Terceros que te nombran",
      description: "Webs ajenas citadas en respuestas que te nombran.",
      pages: named,
      percent: pct[1],
      tab: "Terceros",
    },
    {
      key: "competitor",
      label: "Competidores",
      description: "Páginas de tus competidores.",
      pages: competitor,
      percent: pct[2],
      tab: "Competidores",
    },
    {
      key: "other",
      label: "Otros terceros",
      description: "Webs ajenas en respuestas que no te nombran.",
      pages: other,
      percent: pct[3],
      tab: "Terceros",
    },
  ];
}

export function tabOf(item: Pick<PageItem, "category">): Exclude<CitationTab, "Todas"> {
  return item.category === "brand" ? "Tuyas" : item.category === "competitor" ? "Competidores" : "Terceros";
}

export function tabCounts(items: Array<Pick<PageItem, "category">>): Record<CitationTab, number> {
  const counts: Record<CitationTab, number> = { Todas: items.length, Tuyas: 0, Competidores: 0, Terceros: 0 };
  for (const i of items) counts[tabOf(i)] += 1;
  return counts;
}

export function filterPages(items: PageItem[], tab: CitationTab, query: string): PageItem[] {
  const q = fold(query.trim());
  return items.filter(
    (i) => (tab === "Todas" || tabOf(i) === tab) && (!q || fold(`${i.url} ${i.domain} ${i.title}`).includes(q)),
  );
}

export type LeadPart = { text: string; strong?: boolean; jump?: boolean };

/** Header sentence: only figures the screen already shows, no claim about pages. */
export function citationsLead(input: { totalCited: number; own: number; reachable: number }): LeadPart[] {
  const { totalCited, own, reachable } = input;
  if (totalCited <= 0) return [];
  const parts: LeadPart[] = [{ text: "Las webs que la IA usa como fuente. " }];
  if (own > 0) {
    parts.push({ text: `El ${Math.round((own / totalCited) * 100)}% de las citas`, strong: true }, { text: " son tuyas" });
  } else {
    parts.push({ text: "Ninguna de las citas apunta a tu web", strong: true });
  }
  if (reachable > 0) {
    parts.push(
      { text: " y hay " },
      { text: `${reachable} ${reachable === 1 ? "web alcanzable" : "webs alcanzables"}`, jump: true },
      { text: " que no te nombran." },
    );
  } else {
    parts.push({ text: "." });
  }
  return parts;
}
