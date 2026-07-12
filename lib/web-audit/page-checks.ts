/**
 * Deterministic, no-LLM technical GEO checks for a single fetched page
 * (WEB-AUDIT-2, expanded under WEB-AUDIT-R3 with indexing/citability/OG
 * signals — founder-approved 2026-07-12). Pure string/regex scans over raw
 * HTML — no DOM library dependency (see
 * docs/specs/web-audit/phase-2-technical-audit.md). No I/O, fully
 * unit-testable.
 *
 * R3 rescaled every existing check's point weight to make room for the new
 * indexing/citability dimensions while keeping the total at 100 — see the
 * weights inline below. This means `pageScore` for the SAME page can differ
 * before/after this change even with no content change on the audited site;
 * the UI surfaces "criterios ampliados" alongside the score so this never
 * reads as a silent regression.
 */

const STRUCTURED_DATA_TYPES = new Set([
  "Article",
  "NewsArticle",
  "BlogPosting",
  "FAQPage",
  "HowTo",
  "Product",
  "Organization",
  "WebPage"
]);

export type StructuredDataCheck = { pass: boolean; matchedTypes: string[] };
export type AnswerFormatCheck = {
  points: number;
  hasOneH1: boolean;
  hasTwoH2: boolean;
  hasAnswerFirstIntro: boolean;
  /** Raw counts backing hasOneH1/hasTwoH2 — surfaced so guidance can cite the actual measured value, not just pass/fail. */
  h1Count: number;
  h2Count: number;
};
export type MetadataCheck = {
  points: number;
  titleOk: boolean;
  descriptionOk: boolean;
  /** Optional ONLY because persisted pre-R3 snapshots lack it (checkMetadata always sets it) — undefined means "never measured", which is not the same as false. */
  ogOk?: boolean;
  /** Raw lengths backing titleOk/descriptionOk — surfaced for the same reason as h1Count/h2Count above. */
  titleLength: number;
  descriptionLength: number;
};
export type FreshnessStatus = "fresh" | "aging" | "stale" | "unknown";
export type FreshnessCheck = { status: FreshnessStatus; points: number; date: string | null };

export type IndexabilityCheck = {
  points: number;
  canonicalPresent: boolean;
  /** true only when a canonical tag exists AND resolves to the audited domain (or a subdomain of it). */
  canonicalOk: boolean;
  canonicalUrl: string | null;
  /** true when a <meta name="robots" content="..."> tag contains "noindex". Absence of the tag means indexable (the default). */
  noindex: boolean;
  hreflangPresent: boolean;
};

export type CitabilityCheck = {
  points: number;
  hasListOrTable: boolean;
  /** Word count over visible text only — <script>/<style> block contents are excluded, see stripToVisibleText. */
  wordCount: number;
  contentOk: boolean;
};

export type PageCheckResult = {
  structuredData: StructuredDataCheck;
  answerFormat: AnswerFormatCheck;
  metadata: MetadataCheck;
  freshness: FreshnessCheck;
  /** Optional ONLY because persisted pre-R3 snapshots lack them (buildPageCheckResult always sets both) — every consumer of a persisted row must tolerate their absence. Production crash 2026-07-12: the web-audit page read `.noindex` off a pre-R3 row and took the whole page down. */
  indexability?: IndexabilityCheck;
  citability?: CitabilityCheck;
  /** 0-100, rescaled from an 85-point baseline when freshness is unknown (see buildPageCheckResult). */
  pageScore: number;
};

export type PageCheckContext = {
  /** The page's own (post-redirect) URL — used to resolve a relative canonical href to an absolute one. */
  pageUrl: string;
  projectDomainNormalized: string;
};

const LD_JSON_RE = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function extractLdJsonNodes(html: string): unknown[] {
  const nodes: unknown[] = [];
  for (const match of html.matchAll(LD_JSON_RE)) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) {
        nodes.push(...parsed);
      } else if (parsed && Array.isArray((parsed as Record<string, unknown>)["@graph"])) {
        nodes.push(...((parsed as Record<string, unknown>)["@graph"] as unknown[]));
      } else if (parsed && typeof parsed === "object") {
        nodes.push(parsed);
      }
    } catch {
      // malformed JSON-LD ignored, per spec — never throws, never counts
    }
  }
  return nodes;
}

export function checkStructuredData(html: string): StructuredDataCheck {
  const matchedTypes: string[] = [];
  for (const node of extractLdJsonNodes(html)) {
    const type = (node as Record<string, unknown> | null)?.["@type"];
    const types = Array.isArray(type) ? type : [type];
    for (const t of types) {
      if (typeof t === "string" && STRUCTURED_DATA_TYPES.has(t)) matchedTypes.push(t);
    }
  }
  return { pass: matchedTypes.length > 0, matchedTypes: [...new Set(matchedTypes)] };
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Like stripTags, but drops <script>/<style> block CONTENTS first — a JSON-LD blob or a CSS rule is not visible text and must never count toward the content-length check. */
function stripToVisibleText(html: string): string {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  return stripTags(withoutScripts);
}

export function checkAnswerFormat(html: string, structuredData: StructuredDataCheck): AnswerFormatCheck {
  const h1Matches = html.match(/<h1[\s>]/gi) ?? [];
  const h2Matches = html.match(/<h2[\s>]/gi) ?? [];
  const hasOneH1 = h1Matches.length === 1;
  const hasTwoH2 = h2Matches.length >= 2;

  let hasAnswerFirstIntro = structuredData.matchedTypes.includes("FAQPage");
  if (!hasAnswerFirstIntro) {
    const h1EndIdx = html.search(/<\/h1\s*>/i);
    if (h1EndIdx !== -1) {
      const windowHtml = html.slice(h1EndIdx, h1EndIdx + 3000);
      for (const match of windowHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
        if (stripTags(match[1]).length >= 200) {
          hasAnswerFirstIntro = true;
          break;
        }
      }
    }
  }

  // R3 weight: 5+5+5 = 15 (was 10+10+10 = 30 pre-R3) — see module header.
  const points = (hasOneH1 ? 5 : 0) + (hasTwoH2 ? 5 : 0) + (hasAnswerFirstIntro ? 5 : 0);
  return { points, hasOneH1, hasTwoH2, hasAnswerFirstIntro, h1Count: h1Matches.length, h2Count: h2Matches.length };
}

function getAttr(tag: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i");
  const match = tag.match(re);
  return match ? match[1] : null;
}

function checkOpenGraph(html: string): { ok: boolean; titleFound: boolean; descriptionFound: boolean } {
  const titleMatch =
    html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["'][^>]*>/i) ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["'][^>]*>/i);
  const descMatch =
    html.match(/<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']*)["'][^>]*>/i) ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["'][^>]*>/i);
  const titleFound = Boolean(titleMatch?.[1]?.trim());
  const descriptionFound = Boolean(descMatch?.[1]?.trim());
  return { ok: titleFound && descriptionFound, titleFound, descriptionFound };
}

export function checkMetadata(html: string): MetadataCheck {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]) : "";
  const titleOk = title.length >= 15 && title.length <= 70;

  const descMatch =
    html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i) ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i);
  const description = descMatch ? descMatch[1].trim() : "";
  const descriptionOk = description.length >= 50 && description.length <= 160;

  const ogOk = checkOpenGraph(html).ok;

  // R3 weight: 5+5+5 = 15 (was 10+10 = 20 pre-R3) — see module header.
  const points = (titleOk ? 5 : 0) + (descriptionOk ? 5 : 0) + (ogOk ? 5 : 0);
  return { points, titleOk, descriptionOk, ogOk, titleLength: title.length, descriptionLength: description.length };
}

function parseDate(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function extractDate(html: string): Date | null {
  for (const node of extractLdJsonNodes(html)) {
    const record = node as Record<string, unknown> | null;
    const found =
      parseDate(record?.dateModified as string | undefined) ?? parseDate(record?.datePublished as string | undefined);
    if (found) return found;
  }

  const metaModified = html.match(
    /<meta[^>]+property=["']article:modified_time["'][^>]+content=["']([^"']*)["'][^>]*>/i
  );
  const fromModified = parseDate(metaModified?.[1]);
  if (fromModified) return fromModified;

  const metaLastMod = html.match(/<meta[^>]+name=["']last-modified["'][^>]+content=["']([^"']*)["'][^>]*>/i);
  return parseDate(metaLastMod?.[1]);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function checkFreshness(html: string, now: Date): FreshnessCheck {
  const date = extractDate(html);
  if (!date) return { status: "unknown", points: 0, date: null };

  const ageDays = (now.getTime() - date.getTime()) / MS_PER_DAY;
  // R3 weight: fresh=15, aging=8 (was 20/10 pre-R3) — see module header.
  if (ageDays <= 180) return { status: "fresh", points: 15, date: date.toISOString() };
  if (ageDays <= 540) return { status: "aging", points: 8, date: date.toISOString() };
  return { status: "stale", points: 0, date: date.toISOString() };
}

/** Mirrors lib/web-audit/fetch-page.ts's isAllowedAuditHost exactly (label-boundary match) — kept as a local copy so this module stays a pure, dependency-free, fully-unit-testable string scanner (same rationale opportunity-matrix.ts documents for its own mirrored copy). */
function isSameOrSubdomainHost(hostname: string, projectDomainNormalized: string): boolean {
  const h = hostname.toLowerCase();
  if (!h || !projectDomainNormalized) return false;
  return h === projectDomainNormalized || h.endsWith(`.${projectDomainNormalized}`);
}

const LINK_TAG_RE = /<link\b[^>]*>/gi;

function findCanonical(html: string, pageUrl: string, projectDomainNormalized: string): { present: boolean; url: string | null; sameDomain: boolean } {
  for (const match of html.matchAll(LINK_TAG_RE)) {
    const tag = match[0];
    const rel = getAttr(tag, "rel");
    if (!rel || rel.toLowerCase() !== "canonical") continue;
    const href = getAttr(tag, "href");
    if (!href) return { present: true, url: null, sameDomain: false };
    try {
      const resolved = new URL(href, pageUrl);
      return { present: true, url: resolved.toString(), sameDomain: isSameOrSubdomainHost(resolved.hostname, projectDomainNormalized) };
    } catch {
      return { present: true, url: null, sameDomain: false };
    }
  }
  return { present: false, url: null, sameDomain: false };
}

function hasHreflang(html: string): boolean {
  for (const match of html.matchAll(LINK_TAG_RE)) {
    const tag = match[0];
    const rel = getAttr(tag, "rel");
    if (rel?.toLowerCase() !== "alternate") continue;
    if (getAttr(tag, "hreflang")) return true;
  }
  return false;
}

function hasNoindex(html: string): boolean {
  const metaTagRe = /<meta\b[^>]*>/gi;
  for (const match of html.matchAll(metaTagRe)) {
    const tag = match[0];
    if ((getAttr(tag, "name") ?? "").toLowerCase() !== "robots") continue;
    if ((getAttr(tag, "content") ?? "").toLowerCase().includes("noindex")) return true;
  }
  return false;
}

/**
 * Indexing signals (WEB-AUDIT-R3): whether the page can even be indexed
 * (noindex is a hard blocker worth the most points here — a verified page
 * with noindex can never be cited, no matter how good the rest of it is),
 * whether its canonical points at the audited domain, and whether it
 * declares hreflang alternates. hreflang absence is deliberately never
 * treated as a hard failure in the guidance text (buildPageCheckGuidance) —
 * a single-market site has no hreflang to add, and asserting a universal
 * problem there would be inventing urgency that doesn't exist for that site.
 */
export function checkIndexability(html: string, context: PageCheckContext): IndexabilityCheck {
  const canonical = findCanonical(html, context.pageUrl, context.projectDomainNormalized);
  const noindex = hasNoindex(html);
  const hreflangPresent = hasHreflang(html);

  // R3 weight: canonical 5 + indexable 10 + hreflang 5 = 20 — see module header.
  const points = (canonical.present && canonical.sameDomain ? 5 : 0) + (noindex ? 0 : 10) + (hreflangPresent ? 5 : 0);
  return {
    points,
    canonicalPresent: canonical.present,
    canonicalOk: canonical.present && canonical.sameDomain,
    canonicalUrl: canonical.url,
    noindex,
    hreflangPresent
  };
}

const MIN_SUBSTANTIVE_WORD_COUNT = 300;

/**
 * Citability signals (WEB-AUDIT-R3): structured content (lists/tables) reads
 * better for AI answer engines than a wall of prose, and a page needs enough
 * real, visible text to be worth citing at all. 300 words is an arbitrary but
 * documented bar for "not a stub page" — deliberately generous rather than a
 * strict SEO word-count target, since the point is ruling out near-empty
 * pages, not grading prose length.
 */
export function checkCitability(html: string): CitabilityCheck {
  const hasListOrTable = /<(ul|ol|table)[\s>]/i.test(html);
  const wordCount = stripToVisibleText(html).split(/\s+/).filter(Boolean).length;
  const contentOk = wordCount >= MIN_SUBSTANTIVE_WORD_COUNT;

  // R3 weight: 10 + 10 = 20 — see module header.
  const points = (hasListOrTable ? 10 : 0) + (contentOk ? 10 : 0);
  return { points, hasListOrTable, wordCount, contentOk };
}

/**
 * Combines the six checks into a page's overall score. When freshness can't
 * be determined at all, the score is computed over the remaining 85 points
 * (structured data 15 + answer format 15 + metadata 15 + indexability 20 +
 * citability 20) and rescaled to 0-100 — a page with no discoverable date
 * must never read as "stale" (0 freshness points folded straight into the
 * total would do exactly that).
 */
export function buildPageCheckResult(html: string, context: PageCheckContext, now: Date = new Date()): PageCheckResult {
  const structuredData = checkStructuredData(html);
  const answerFormat = checkAnswerFormat(html, structuredData);
  const metadata = checkMetadata(html);
  const freshness = checkFreshness(html, now);
  const indexability = checkIndexability(html, context);
  const citability = checkCitability(html);

  const structuredPoints = structuredData.pass ? 15 : 0;
  const baseline = structuredPoints + answerFormat.points + metadata.points + indexability.points + citability.points; // out of 85

  const pageScore =
    freshness.status === "unknown" ? Math.round((baseline / 85) * 100) : Math.round(baseline + freshness.points);

  return { structuredData, answerFormat, metadata, freshness, indexability, citability, pageScore };
}

/**
 * Deterministic (no LLM) "qué hacer" guidance per failing sub-check, derived
 * purely from the already-computed PageCheckResult — no interpretation, no
 * generated prose. Reviewed with geo-strategy (2026-07-11, extended for R3
 * 2026-07-12): each of these checks is objective/mechanical, so the fix
 * follows directly from the failed sub-check itself. This is deliberately
 * NOT the same thing as an AI-generated draft (a rewritten title/description/
 * intro) — that's a separate, larger feature (Gemini runtime, its own rate
 * limit, output sanitization) parked under the roadmap's WEB-AUDIT-BRIEF
 * phase, which needs its own Task Intake and data-guardian review before it
 * exists.
 *
 * Cites the real measured value (e.g. "ahora: 2 detectados") wherever the
 * PageCheckResult carries one — a passed check contributes nothing here.
 *
 * LEGACY SNAPSHOTS: `check` comes straight from a persisted JSONB row, and a
 * snapshot taken before R3 shipped has NO indexability/citability objects and
 * no metadata.ogOk (production crash 2026-07-12: "Cannot read properties of
 * undefined (reading 'noindex')" on a pre-R3 snapshot). The R3 fields are
 * read through explicit `| undefined` locals — an absent sub-check yields no
 * guidance, never an assertion about something that was never measured. Same
 * rationale as the existing `?? 0` guards for h1Count/titleLength below.
 */
export function buildPageCheckGuidance(check: PageCheckResult): string[] {
  const lines: string[] = [];
  const indexability: IndexabilityCheck | undefined = check.indexability;
  const citability: CitabilityCheck | undefined = check.citability;

  if (!check.structuredData.pass) {
    lines.push(
      "Añade datos estructurados (JSON-LD) con un @type reconocido por los motores de IA: Article, FAQPage, HowTo, Product, Organization..."
    );
  }
  if (!check.answerFormat.hasOneH1) {
    // `?? 0`: defensive against a snapshot persisted before h1Count/h2Count
    // existed (pre-existing cached rows within the 24h cache window) —
    // never render "undefined detectado".
    const h1Count = check.answerFormat.h1Count ?? 0;
    lines.push(`Usa un único <h1> por página (ahora: ${h1Count} detectado${h1Count === 1 ? "" : "s"}).`);
  }
  if (!check.answerFormat.hasTwoH2) {
    lines.push(`Añade al menos dos <h2> que estructuren la respuesta (ahora: ${check.answerFormat.h2Count ?? 0}).`);
  }
  if (!check.answerFormat.hasAnswerFirstIntro) {
    lines.push(
      "Añade un párrafo de al menos 200 caracteres justo después del título que responda directamente a la pregunta principal."
    );
  }
  if (!check.metadata.titleOk) {
    lines.push(`Ajusta el <title> a entre 15 y 70 caracteres (ahora: ${check.metadata.titleLength ?? 0}).`);
  }
  if (!check.metadata.descriptionOk) {
    lines.push(`Ajusta la meta description a entre 50 y 160 caracteres (ahora: ${check.metadata.descriptionLength ?? 0}).`);
  }
  // `=== false`, not `!`: a legacy snapshot never measured OG at all
  // (ogOk undefined) — only a real measured failure earns guidance.
  if (check.metadata.ogOk === false) {
    lines.push("Añade etiquetas Open Graph (og:title y og:description) para que la página se comparta y previsualice correctamente.");
  }
  if (check.freshness.status === "unknown") {
    lines.push(
      "Añade una fecha de actualización localizable: dateModified/datePublished en el JSON-LD, o una etiqueta <meta> de última modificación."
    );
  } else if (check.freshness.status === "stale" || check.freshness.status === "aging") {
    lines.push("Actualiza el contenido de esta página y refresca su fecha de modificación.");
  }
  if (indexability?.noindex) {
    lines.push(
      "Esta página tiene una etiqueta <meta name=\"robots\"> con noindex: ni Google ni los motores de IA pueden indexarla. Quítala si quieres que sea citable."
    );
  }
  if (indexability && !indexability.canonicalOk) {
    lines.push(
      indexability.canonicalPresent
        ? "El <link rel=\"canonical\"> de esta página apunta a otro dominio — corrígelo para que apunte a esta misma URL en tu dominio."
        : "Añade una etiqueta <link rel=\"canonical\"> que apunte a esta misma página en tu dominio."
    );
  }
  if (indexability && !indexability.hreflangPresent) {
    lines.push(
      "Si esta página tiene versiones en otros idiomas o países, añade etiquetas <link rel=\"alternate\" hreflang=\"...\"> para cada una."
    );
  }
  if (citability && !citability.hasListOrTable) {
    lines.push("Añade listas o tablas que estructuren la información — los motores de IA citan con más frecuencia contenido en ese formato.");
  }
  if (citability && !citability.contentOk) {
    lines.push(
      `Amplía el contenido visible de esta página (ahora: ${citability.wordCount} palabras) — los motores de IA prefieren respuestas sustanciales.`
    );
  }

  return lines;
}
