/**
 * Deterministic, no-LLM technical GEO checks for a single fetched page
 * (WEB-AUDIT-2). Pure string/regex scans over raw HTML — no DOM library
 * dependency (see docs/specs/web-audit/phase-2-technical-audit.md). No I/O,
 * fully unit-testable.
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
  /** Raw lengths backing titleOk/descriptionOk — surfaced for the same reason as h1Count/h2Count above. */
  titleLength: number;
  descriptionLength: number;
};
export type FreshnessStatus = "fresh" | "aging" | "stale" | "unknown";
export type FreshnessCheck = { status: FreshnessStatus; points: number; date: string | null };

export type PageCheckResult = {
  structuredData: StructuredDataCheck;
  answerFormat: AnswerFormatCheck;
  metadata: MetadataCheck;
  freshness: FreshnessCheck;
  /** 0-100, rescaled from an 80-point baseline when freshness is unknown (see buildPageCheckResult). */
  pageScore: number;
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

  const points = (hasOneH1 ? 10 : 0) + (hasTwoH2 ? 10 : 0) + (hasAnswerFirstIntro ? 10 : 0);
  return { points, hasOneH1, hasTwoH2, hasAnswerFirstIntro, h1Count: h1Matches.length, h2Count: h2Matches.length };
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

  const points = (titleOk ? 10 : 0) + (descriptionOk ? 10 : 0);
  return { points, titleOk, descriptionOk, titleLength: title.length, descriptionLength: description.length };
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
  if (ageDays <= 180) return { status: "fresh", points: 20, date: date.toISOString() };
  if (ageDays <= 540) return { status: "aging", points: 10, date: date.toISOString() };
  return { status: "stale", points: 0, date: date.toISOString() };
}

/**
 * Combines the four checks into a page's overall score. When freshness can't
 * be determined at all, the score is computed over the remaining 80 points
 * (structured data 30 + answer format 30 + metadata 20) and rescaled to
 * 0-100 — a page with no discoverable date must never read as "stale"
 * (0 freshness points folded straight into the total would do exactly that).
 */
export function buildPageCheckResult(html: string, now: Date = new Date()): PageCheckResult {
  const structuredData = checkStructuredData(html);
  const answerFormat = checkAnswerFormat(html, structuredData);
  const metadata = checkMetadata(html);
  const freshness = checkFreshness(html, now);

  const structuredPoints = structuredData.pass ? 30 : 0;
  const baseline = structuredPoints + answerFormat.points + metadata.points; // out of 80

  const pageScore =
    freshness.status === "unknown" ? Math.round((baseline / 80) * 100) : Math.round(baseline + freshness.points);

  return { structuredData, answerFormat, metadata, freshness, pageScore };
}

/**
 * Deterministic (no LLM) "qué hacer" guidance per failing sub-check, derived
 * purely from the already-computed PageCheckResult — no interpretation, no
 * generated prose. Reviewed with geo-strategy (2026-07-11): each of these
 * checks is objective/mechanical (a missing <h1>, a title outside a length
 * range, a date that can't be found), so the fix follows directly from the
 * failed sub-check itself. This is deliberately NOT the same thing as an
 * AI-generated draft (a rewritten title/description/intro) — that's a
 * separate, larger feature (Gemini runtime, its own rate limit, output
 * sanitization) parked under the roadmap's WEB-AUDIT-BRIEF phase, which
 * needs its own Task Intake and data-guardian review before it exists.
 *
 * Cites the real measured value (e.g. "ahora: 2 detectados") wherever the
 * PageCheckResult carries one — a passed check contributes nothing here.
 */
export function buildPageCheckGuidance(check: PageCheckResult): string[] {
  const lines: string[] = [];

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
  if (check.freshness.status === "unknown") {
    lines.push(
      "Añade una fecha de actualización localizable: dateModified/datePublished en el JSON-LD, o una etiqueta <meta> de última modificación."
    );
  } else if (check.freshness.status === "stale" || check.freshness.status === "aging") {
    lines.push("Actualiza el contenido de esta página y refresca su fecha de modificación.");
  }

  return lines;
}
