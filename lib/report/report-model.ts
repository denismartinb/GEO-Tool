import { classifySourceType } from "@/lib/citations/source-type";
import { resolveCitation } from "@/lib/citations/aggregate-citations";
import { isSameOrSubdomain, normalizeDomain } from "@/lib/domains/brand-domain";
import { isGenericEntityName } from "@/lib/entity-hygiene/generic-entities";
import { getEngineMeta, normalizeProvider } from "@/lib/scan/engine-meta";

/**
 * GEO-REPORT-1 Fase 1 — the view-model of the GenScore report (design:
 * docs/design-reference/geo-report-1/). One pure function turns the latest
 * completed scan of a project into everything the eight printed pages show.
 *
 * Pure on purpose, same discipline as `lib/recommendations/export-plan.ts`:
 * no Supabase, no `Date.now()`, no DOM. The loader (Fase 2) resolves the rows
 * and hands them in; this module decides what the report says about them.
 *
 * Content rules (founder, 2026-10-09; log §248), enforced by the tests:
 *  - only percentages and ratios, never an absolute count of questions,
 *    answers or scans — every figure leaves this module as a share;
 *  - engines by name only (ChatGPT, Gemini, Claude), never a model version;
 *  - the question set is always «preguntas principales de búsqueda»;
 *  - every narrative line is a template over computed data. The only text
 *    that does not come from a template is a quote, and a quote is a literal
 *    sentence of a stored answer, labelled as such by the page.
 *  - a block with no data is omitted (null / empty), never filled in.
 */

export const REPORT_ENGINE_ORDER = ["gemini", "openai", "claude"] as const;
export const QUESTION_SET_LABEL = "preguntas principales de búsqueda";
export const UNGROUPED_TOPIC = "Otras preguntas";

const MAX_BARS = 10;
const MAX_CLOUD = 80;
const MAX_SOURCES_PER_COLUMN = 7;
const MAX_OWN_PAGES = 3;
const MAX_QUOTE_CHARS = 240;

// ---- input -----------------------------------------------------------------

export type ReportAnswer = {
  promptId: string;
  promptText: string;
  /** project_prompts.category, already resolved by the caller. */
  topic: string | null;
  provider: string | null;
  rawText: string | null;
  /** scan_prompt_results.extracted_json (already verified by MENTION-VERIFY-1). */
  extracted: unknown;
};

/** Whether the customer's site has a page that answers the question (web-audit coverage map). */
export type ReportCoverage = "yes" | "no" | "unknown";

export type ReportTechCheck = {
  label: string;
  detail: string | null;
  state: "ok" | "warn" | "bad";
  text: string;
};

export type ReportPlanItem = {
  title: string;
  description: string;
  firstStep: string | null;
  /** Engine providers backing the recommendation (evidence_json.affected_prompt_details[].provider). */
  providers: string[];
  /** Topics of the questions the recommendation targets. */
  topics: string[];
};

export type ReportInput = {
  brandName: string;
  /** Other names the brand goes by (project brand aliases), used to find quotes. */
  brandAliases: string[];
  domain: string;
  /** ISO date of the scan the report describes. */
  scanDate: string;
  /** Puntuación GEO from lib/metrics/run-metrics.ts — null when it cannot be resolved. */
  geoScore: number | null;
  answers: ReportAnswer[];
  /** Active tracked competitors. */
  competitors: Array<{ name: string; domain: string | null }>;
  /** Keyed by promptId; null when no coverage audit exists yet. */
  coverage: Record<string, ReportCoverage> | null;
  technical: { score: number | null; checks: ReportTechCheck[] } | null;
  /** The plan as `selectPlan` orders it; the report shows the first three. */
  plan: ReportPlanItem[];
};

// ---- output ----------------------------------------------------------------

/** A share in [0, 1]. Formatting to "12%" / "<1%" is `formatShare`'s job. */
export type Share = number;

export type ReportEngineSummary = {
  provider: string;
  label: string;
  mentionShare: Share;
  /** Best 1-based position when named, or null. */
  bestPosition: number | null;
  /** Whether this engine cited a page of the customer's domain. Null for engines that do not cite sources. */
  citesOwnSite: boolean | null;
};

export type ReportFinding = { tone: "pos" | "neg" | "info"; title: string; text: string };

export type ReportCell = { kind: "you"; position: number | null } | { kind: "others" } | { kind: "none" };

export type ReportMatrixRow = {
  promptId: string;
  promptText: string;
  cells: Array<{ provider: string; cell: ReportCell }>;
  /** "gap" = no own page while the AI recommends others; null when coverage is unknown. */
  page: "yes" | "gap" | "no" | null;
};

export type ReportBar = {
  name: string;
  isBrand: boolean;
  share: Share;
  /** Share of all answers, split by engine, for the stacked bar. */
  byEngine: Array<{ provider: string; share: Share }>;
};

export type ReportQuote = { text: string; provider: string; engineLabel: string; topic: string };

export type ReportRivalCard = {
  eyebrow: string;
  name: string;
  text: string;
  quote: ReportQuote | null;
};

export type ReportSourceColumn = { title: string; domains: string[]; includesOwn: boolean };

export type ReportModel = {
  brandName: string;
  domain: string;
  scanDate: string;
  geoScore: number | null;
  engines: ReportEngineSummary[];
  cover: { mentionShare: Share };
  summary: {
    lede: string;
    ownCitationShare: Share | null;
    weakestEngine: ReportEngineSummary;
    technicalScore: number | null;
    findings: ReportFinding[];
  };
  matrix: { hasCoverage: boolean; groups: Array<{ topic: string; rows: ReportMatrixRow[] }> };
  competition: { bars: ReportBar[]; cards: ReportRivalCard[]; cloud: Array<{ name: string; isBrand: boolean }> };
  sources: {
    columns: ReportSourceColumn[];
    ownCitationShare: Share | null;
    ownPages: string[];
    topSource: { domain: string; share: Share } | null;
    brandQuotes: ReportQuote[];
  } | null;
  technical: { score: number | null; coverageShare: Share | null; checks: ReportTechCheck[]; reading: string | null } | null;
  plan: Array<ReportPlanItem & { engineLabels: string[] }>;
};

// ---- helpers ---------------------------------------------------------------

type Ext = {
  brand?: { mentioned?: boolean; position?: number | null };
  competitors?: Array<{ name?: string; mentioned?: boolean; position?: number | null }>;
  other_brands_mentioned?: unknown;
  citations?: Array<{ url?: string | null; domain?: string | null; title?: string | null; source?: string | null }>;
};

function parseExt(raw: unknown): Ext {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Ext;
}

function key(name: string): string {
  return name.trim().toLowerCase();
}

/** "12%", "<1%" or "0%" — the only way a share leaves the report as text. */
export function formatShare(share: Share): string {
  const v = share * 100;
  if (v > 0 && v < 1) return "<1%";
  return `${Math.round(v)}%`;
}

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

function ordinal(position: number): string {
  return `${position}.º`;
}

function cleanSentence(s: string): string {
  return s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>]+/g, "")
    .replace(/^\s*(?:[-•]|\d+[.)])\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when `sentence` names `needle` as a word of its own: not inside a
 * longer word, and not as the start of a longer capitalised name
 * ("Fibrox Plus+", "Acme Studio" when the needle is "acme"). That second
 * case is a different product or brand; quoting it as a description of the
 * brand is a misattribution (GS-07, log §276).
 */
function namesAsWord(sentence: string, needle: string): boolean {
  const lower = sentence.toLowerCase();
  let from = 0;
  for (;;) {
    const at = lower.indexOf(needle, from);
    if (at === -1) return false;
    from = at + 1;
    const before = sentence.slice(0, at);
    const after = sentence.slice(at + needle.length);
    if (/[\p{L}\p{N}]$/u.test(before)) continue;
    if (/^[\p{L}\p{N}+]/u.test(after)) continue;
    if (/^\s+(?:\p{Lu}[\p{L}\p{N}]*\+?|\+)/u.test(after)) continue;
    return true;
  }
}

/**
 * The first sentence of `text` that names one of `names`, cleaned of markdown.
 * Exported for tests. Returns null when no sentence names it — a quote is
 * never paraphrased or invented.
 *
 * `exclude` lists other brands of the same answer: a sentence that also
 * names one of them is about that brand as much as ours ("Lowco, la marca de
 * Fibrox…"), so it is not quoted as a description of ours.
 */
export function findQuote(text: string | null, names: string[], exclude: string[] = []): string | null {
  if (!text) return null;
  const needles = names.map(key).filter(Boolean);
  if (needles.length === 0) return null;
  const blocked = exclude.map(key).filter((n) => n && !needles.includes(n));
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  for (const raw of sentences) {
    const s = cleanSentence(raw);
    if (s.length < 25) continue;
    if (!needles.some((n) => namesAsWord(s, n))) continue;
    if (blocked.some((n) => namesAsWord(s, n))) continue;
    if (s.length <= MAX_QUOTE_CHARS) return s;
    return `${s.slice(0, MAX_QUOTE_CHARS - 1).replace(/\s+\S*$/, "")}…`;
  }
  return null;
}

/**
 * GS-07 (log §276): each citation goes through `resolveCitation`, the same
 * function Páginas citadas uses, so the report and that screen name the same
 * sites. Reading `domain || url` raw let Gemini's grounding redirect
 * (vertexaisearch.cloud.google.com) through as "the most cited site" whenever
 * a domain was not resolved, and printed the redirect as one of the
 * customer's own pages. A citation that resolves to no domain is left out:
 * the report has no honest name for it.
 */
function citedDomains(ext: Ext): Array<{ domain: string; url: string | null }> {
  const out: Array<{ domain: string; url: string | null }> = [];
  for (const c of ext.citations ?? []) {
    if (!c) continue;
    const resolved = resolveCitation(c as Parameters<typeof resolveCitation>[0]);
    if (!resolved?.domain) continue;
    out.push({ domain: resolved.domain, url: resolved.url || null });
  }
  return out;
}

// ---- model -----------------------------------------------------------------

/** Returns null when the scan has no answers: an empty report is never printed. */
export function buildReportModel(input: ReportInput): ReportModel | null {
  const answers = input.answers.filter((a) => a.promptId);
  if (answers.length === 0) return null;

  const own = normalizeDomain(input.domain);
  const brandKeys = new Set([input.brandName, ...input.brandAliases].map(key));
  const competitorByKey = new Map(input.competitors.map((c) => [key(c.name), c]));
  const competitorDomains = input.competitors
    .map((c) => (c.domain ? normalizeDomain(c.domain) : ""))
    .filter(Boolean);

  const rows = answers.map((a) => {
    const ext = parseExt(a.extracted);
    const provider = normalizeProvider(a.provider);
    const named = Boolean(ext.brand?.mentioned);
    const position = named && typeof ext.brand?.position === "number" ? ext.brand.position : null;
    const others: string[] = [];
    const push = (n: unknown) => {
      if (typeof n !== "string") return;
      const name = n.trim();
      if (!name || brandKeys.has(key(name)) || isGenericEntityName(name)) return;
      const canonical = competitorByKey.get(key(name))?.name ?? name;
      if (!others.some((o) => key(o) === key(canonical))) others.push(canonical);
    };
    for (const c of ext.competitors ?? []) if (c?.mentioned) push(c.name);
    if (Array.isArray(ext.other_brands_mentioned)) for (const n of ext.other_brands_mentioned) push(n);
    return { ...a, provider, named, position, others, cited: citedDomains(ext) };
  });

  const present = new Set(rows.map((r) => r.provider));
  const engineOrder = [
    ...REPORT_ENGINE_ORDER.filter((e) => present.has(e)),
    ...[...present].filter((e) => !(REPORT_ENGINE_ORDER as readonly string[]).includes(e)).sort()
  ];
  const share = (num: number, den: number): Share => (den > 0 ? num / den : 0);
  const namedShare = (rs: typeof rows) => share(rs.filter((r) => r.named).length, rs.length);

  // ---- engines ----
  const engines: ReportEngineSummary[] = engineOrder.map((provider) => {
    const rs = rows.filter((r) => r.provider === provider);
    const positions = rs.map((r) => r.position).filter((p): p is number => p !== null);
    const grounded = getEngineMeta(provider).grounded;
    return {
      provider,
      label: getEngineMeta(provider).label,
      mentionShare: namedShare(rs),
      bestPosition: positions.length ? Math.min(...positions) : null,
      citesOwnSite: grounded ? rs.some((r) => r.cited.some((c) => isSameOrSubdomain(c.domain, own))) : null
    };
  });
  const mentionShare = namedShare(rows);
  const weakestEngine = engines.reduce((w, e) => (e.mentionShare < w.mentionShare ? e : w), engines[0]);
  const bestEngine = engines.reduce((b, e) => (e.mentionShare > b.mentionShare ? e : b), engines[0]);

  // ---- topics ----
  const topicOf = (r: { topic: string | null }) => r.topic?.trim() || UNGROUPED_TOPIC;
  const topics = [...new Set(rows.map(topicOf))];
  const displaced = (rs: typeof rows) => share(rs.filter((r) => !r.named && r.others.length > 0).length, rs.length);
  const topicStats = topics.map((t) => {
    const rs = rows.filter((r) => topicOf(r) === t);
    return { topic: t, named: namedShare(rs), displaced: displaced(rs) };
  });

  // ---- competition ----
  const total = rows.length;
  const tally = new Map<string, Map<string, number>>();
  for (const r of rows) {
    for (const n of r.others) {
      const m = tally.get(n) ?? new Map<string, number>();
      m.set(r.provider, (m.get(r.provider) ?? 0) + 1);
      tally.set(n, m);
    }
  }
  const brandByEngine = new Map(engineOrder.map((e) => [e, rows.filter((r) => r.provider === e && r.named).length]));
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  const ranked = [...tally.entries()]
    .map(([name, m]) => ({ name, m, n: sum(m) }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "es"));
  const brandEntry = { name: input.brandName, m: brandByEngine, n: sum(brandByEngine), isBrand: true };
  const withBrand = [...ranked.map((x) => ({ ...x, isBrand: false })), brandEntry].sort(
    (a, b) => b.n - a.n || Number(b.isBrand) - Number(a.isBrand) || a.name.localeCompare(b.name, "es")
  );
  let barEntries = withBrand.slice(0, MAX_BARS);
  if (!barEntries.some((b) => b.isBrand)) barEntries = [...barEntries.slice(0, MAX_BARS - 1), brandEntry];
  const bars: ReportBar[] = barEntries.map((b) => ({
    name: b.name,
    isBrand: b.isBrand,
    share: share(b.n, total),
    byEngine: engineOrder.map((e) => ({ provider: e, share: share(b.m.get(e) ?? 0, total) }))
  }));

  const without = rows.filter((r) => !r.named);
  const inWithout = new Map<string, number>();
  for (const r of without) for (const n of r.others) inWithout.set(n, (inWithout.get(n) ?? 0) + 1);
  const direct = [...inWithout.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))[0]?.[0] ?? null;
  const engineLabelsOf = (name: string) =>
    engineOrder.filter((e) => (tally.get(name)?.get(e) ?? 0) > 0).map((e) => getEngineMeta(e).label);
  const quoteFor = (names: string[], pool: typeof rows, excludeOthers = false): ReportQuote | null => {
    for (const r of pool) {
      const text = findQuote(r.rawText, names, excludeOthers ? r.others : []);
      if (text) return { text, provider: r.provider, engineLabel: getEngineMeta(r.provider).label, topic: topicOf(r) };
    }
    return null;
  };
  const cards: ReportRivalCard[] = [];
  if (direct) {
    const topIsDirect = ranked[0]?.name === direct;
    cards.push({
      eyebrow: topIsDirect ? "Tu rival directo · la marca más nombrada" : "Tu rival directo",
      name: direct,
      text: `Aparece en el ${formatShare(share(inWithout.get(direct) ?? 0, without.length))} de las respuestas que no te nombran. Lo nombra ${list(engineLabelsOf(direct))}.`,
      quote: quoteFor([direct], rows.filter((r) => r.others.includes(direct)))
    });
    const second = topIsDirect ? ranked.find((x) => x.name !== direct) : ranked[0];
    if (second) {
      cards.push({
        eyebrow: topIsDirect ? "También por delante de ti" : "La marca más nombrada",
        name: second.name,
        text: `Sale en el ${formatShare(share(second.n, total))} de las respuestas, en ${list(engineLabelsOf(second.name))}.`,
        quote: quoteFor([second.name], rows.filter((r) => r.others.includes(second.name)))
      });
    }
  }
  const cloud = withBrand.filter((x) => x.n > 0 || x.isBrand).slice(0, MAX_CLOUD).map((x) => ({ name: x.name, isBrand: x.isBrand }));

  // ---- sources ----
  const allCitations = rows.flatMap((r) => r.cited.map((c) => ({ ...c, provider: r.provider })));
  let sources: ReportModel["sources"] = null;
  let ownCitationShare: Share | null = null;
  if (allCitations.length > 0) {
    const ownCitations = allCitations.filter((c) => isSameOrSubdomain(c.domain, own));
    ownCitationShare = share(ownCitations.length, allCitations.length);
    const answersPerDomain = new Map<string, number>();
    for (const r of rows) {
      for (const d of new Set(r.cited.map((c) => c.domain))) {
        if (!isSameOrSubdomain(d, own)) answersPerDomain.set(d, (answersPerDomain.get(d) ?? 0) + 1);
      }
    }
    const byFrequency = [...answersPerDomain.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const columns: ReportSourceColumn[] = [
      { title: "Tus competidores", domains: [], includesOwn: ownCitations.length > 0 },
      { title: "Comparadores y comunidades", domains: [], includesOwn: false },
      { title: "Medios y otras webs", domains: [], includesOwn: false }
    ];
    for (const [d] of byFrequency) {
      const isCompetitor = competitorDomains.some((cd) => isSameOrSubdomain(d, cd));
      const type = classifySourceType(d);
      const col = isCompetitor ? columns[0] : type === "comparator" || type === "community" || type === "encyclopedia" ? columns[1] : columns[2];
      if (col.domains.length < MAX_SOURCES_PER_COLUMN) col.domains.push(d);
    }
    const answersWithSources = rows.filter((r) => r.cited.length > 0).length;
    const ownPages = [
      ...new Set(ownCitations.map((c) => (c.url ?? c.domain).replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")))
    ].slice(0, MAX_OWN_PAGES);
    const brandNames = [input.brandName, ...input.brandAliases];
    const brandQuotes: ReportQuote[] = [];
    for (const provider of engineOrder) {
      const q = quoteFor(brandNames, rows.filter((r) => r.named && r.provider === provider), true);
      if (q) brandQuotes.push(q);
      if (brandQuotes.length === 2) break;
    }
    sources = {
      columns: columns.filter((c) => c.domains.length > 0 || c.includesOwn),
      ownCitationShare,
      ownPages,
      topSource: byFrequency[0] ? { domain: byFrequency[0][0], share: share(byFrequency[0][1], answersWithSources) } : null,
      brandQuotes
    };
  }

  // ---- matrix ----
  const promptIds = [...new Set(rows.map((r) => r.promptId))];
  const promptMeta = new Map(rows.map((r) => [r.promptId, { text: r.promptText, topic: topicOf(r) }]));
  const groups = topics.map((topic) => ({
    topic,
    rows: promptIds
      .filter((id) => promptMeta.get(id)?.topic === topic)
      .map((id): ReportMatrixRow => {
        const rs = rows.filter((r) => r.promptId === id);
        const cells = engineOrder.map((provider) => {
          const er = rs.filter((r) => r.provider === provider);
          const positions = er.filter((r) => r.named).map((r) => r.position);
          let cell: ReportCell;
          if (positions.length) {
            const known = positions.filter((p): p is number => p !== null);
            cell = { kind: "you", position: known.length ? Math.min(...known) : null };
          } else if (er.some((r) => r.others.length > 0)) cell = { kind: "others" };
          else cell = { kind: "none" };
          return { provider, cell };
        });
        const cov = input.coverage?.[id];
        const othersNamed = cells.some((c) => c.cell.kind === "others");
        const page: ReportMatrixRow["page"] =
          !cov || cov === "unknown" ? null : cov === "yes" ? "yes" : othersNamed ? "gap" : "no";
        return { promptId: id, promptText: promptMeta.get(id)?.text ?? "", cells, page };
      })
  }));
  const coverageValues = promptIds.map((id) => input.coverage?.[id]).filter((v) => v === "yes" || v === "no");
  const coverageShare: Share | null = coverageValues.length
    ? share(coverageValues.filter((v) => v === "yes").length, coverageValues.length)
    : null;

  // ---- findings (templates over data only) ----
  const techScore = input.technical?.score ?? null;
  const best = topicStats.reduce((b, t) => (t.named > b.named ? t : b), topicStats[0]);
  const worst = topicStats.reduce((w, t) => (t.displaced > w.displaced ? t : w), topicStats[0]);
  const findings: ReportFinding[] = [];
  if (best.named > 0) {
    const bp = bestEngine.bestPosition;
    findings.push({
      tone: "pos",
      title: `Donde más te nombran: ${best.topic}`,
      text: `En este tema te nombra el ${formatShare(best.named)} de las respuestas.${bp ? ` Tu mejor puesto es ${ordinal(bp)} en ${bestEngine.label}.` : ""}`
    });
  }
  if (worst.displaced > 0) {
    findings.push({
      tone: "neg",
      title: `Donde la IA recomienda a otros: ${worst.topic}`,
      text: `En el ${formatShare(worst.displaced)} de las respuestas de este tema la IA nombra a otras marcas y a ti no.`
    });
  }
  if (direct) {
    findings.push({
      tone: "neg",
      title: `${direct} ocupa tu sitio`,
      text: `Es la marca que más aparece en las respuestas donde tú no sales: en el ${formatShare(share(inWithout.get(direct) ?? 0, without.length))} de ellas.`
    });
  }
  if (techScore !== null || coverageShare !== null) {
    const parts: string[] = [];
    if (techScore !== null) parts.push(`Tu nota técnica es ${techScore}/100.`);
    if (coverageShare !== null)
      parts.push(`El ${formatShare(coverageShare)} de las ${QUESTION_SET_LABEL} tiene una página tuya que la responde.`);
    findings.push({ tone: "info", title: "Tu web: base técnica y contenido", text: parts.join(" ") });
  }

  const withRivals = share(rows.filter((r) => r.others.length > 0).length, total);
  const ledeParts = [
    `El ${formatShare(withRivals)} de las respuestas recomienda marcas con nombre propio. ${input.brandName} sale en el ${formatShare(mentionShare)}.`
  ];
  if (topicStats.length > 1 && best.named > 0 && worst.topic !== best.topic && worst.displaced > 0) {
    ledeParts.push(`Tu mejor tema es ${best.topic}; el peor, ${worst.topic}.`);
  }

  const technical: ReportModel["technical"] =
    input.technical || coverageShare !== null
      ? {
          score: techScore,
          coverageShare,
          checks: input.technical?.checks ?? [],
          reading:
            techScore !== null && coverageShare !== null
              ? `Con una nota técnica de ${techScore}/100, ${
                  coverageShare < 0.5
                    ? `lo que más pesa ahora es el contenido: sólo el ${formatShare(coverageShare)} de tus ${QUESTION_SET_LABEL} tiene una página tuya que la responda.`
                    : `tu web cubre el ${formatShare(coverageShare)} de tus ${QUESTION_SET_LABEL}; el margen está en las fuentes externas que cita la IA.`
                }`
              : null
        }
      : null;

  return {
    brandName: input.brandName,
    domain: input.domain,
    scanDate: input.scanDate,
    geoScore: input.geoScore,
    engines,
    cover: { mentionShare },
    summary: { lede: ledeParts.join(" "), ownCitationShare, weakestEngine, technicalScore: techScore, findings },
    matrix: { hasCoverage: input.coverage !== null, groups },
    competition: { bars, cards, cloud },
    sources,
    technical,
    plan: input.plan.slice(0, 3).map((p) => ({
      ...p,
      engineLabels: [...new Set(p.providers.map((pr) => getEngineMeta(pr).label))]
    }))
  };
}
