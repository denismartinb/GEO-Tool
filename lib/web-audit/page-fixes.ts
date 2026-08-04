import type { PageAuditEntry } from "./technical-audit";
import type { IssueCheckKey } from "./issues";

/**
 * WEB-AUDIT-ISSUES-1 fase 3b — the copyable fix behind each failing check.
 *
 * Pure, no I/O, no `server-only`: importable from Vitest and from the server
 * page alike, exactly like fase 1's `issues.ts`.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS REAL AND WHAT IS A PLACEHOLDER — read before adding a fix.
 * ---------------------------------------------------------------------------
 * The approved mockup promises blocks "rellenos con los datos reales que ya
 * hemos leído de tu web". That is only partly possible, and the boundary is
 * not a matter of effort — it is what `PageCheckResult` persists:
 *
 *   Real, straight from the snapshot:
 *     - the page URL, and its resolved canonical (`indexability.canonicalUrl`)
 *     - the detected freshness date (`freshness.date`)
 *     - which JSON-LD @types the page already declares (`matchedTypes`)
 *     - the measured title/description LENGTHS
 *   Never persisted, so never fillable:
 *     - the page's actual <title>, meta description or <h1> TEXT
 *
 * `page-checks.ts` deliberately stores lengths and booleans, not the strings.
 * So a snippet may quote a URL or a date verbatim, but anything that is the
 * page's own prose has to be a marked placeholder. Every placeholder is
 * declared in `placeholders` so the UI can highlight it instead of letting a
 * user paste `TÍTULO DE LA PÁGINA` into production.
 *
 * Filling those in for real is fase 3c (persist sanitized title/description),
 * which needs its own approval and a data-guardian review — see the Task
 * Intake. Do not quietly re-derive them here from anything.
 */

export type FixLanguage = "html" | "json" | "text";

export type PageFix = {
  /** The failing check this resolves — same keys as `issues.ts`. */
  check: IssueCheckKey;
  /** Where the block goes, in one line. */
  where: string;
  language: FixLanguage;
  snippet: string;
  /**
   * Tokens inside `snippet` the user must replace with their own copy,
   * because the audit never stored the real text. Empty = paste as-is.
   */
  placeholders: string[];
};

export type PageFixContext = {
  /** Brand/project name, used where a snippet needs a publisher or brand. */
  projectName: string;
  /** Normalized domain (no scheme), for absolute URLs when nothing better exists. */
  domainNormalized: string;
};

const TITLE_TOKEN = "TÍTULO DE LA PÁGINA";
const DESCRIPTION_TOKEN = "RESUMEN DE LA PÁGINA EN 1 FRASE";

/** ISO date (YYYY-MM-DD) the page already declares, else a marked placeholder. */
function freshnessDate(page: PageAuditEntry): { value: string; isPlaceholder: boolean } {
  const raw = page.check?.freshness?.date;
  if (!raw) return { value: "AAAA-MM-DD", isPlaceholder: true };
  // Persisted dates are ISO strings; keep only the calendar part, which is
  // what dateModified wants. Never reformat beyond that — a value we cannot
  // parse is passed through rather than guessed at.
  const day = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? { value: day, isPlaceholder: false } : { value: raw, isPlaceholder: true };
}

/**
 * The @type to declare. Reuses whatever the page already publishes so the
 * suggested block does not contradict the site's own vocabulary; falls back to
 * WebPage, which is valid for anything and never wrong enough to hurt.
 */
function schemaType(page: PageAuditEntry): string {
  const existing = page.check?.structuredData?.matchedTypes ?? [];
  return existing[0] ?? "WebPage";
}

function structuredDataFix(page: PageAuditEntry, ctx: PageFixContext): PageFix {
  const { value: date, isPlaceholder: datePlaceholder } = freshnessDate(page);
  const snippet = `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "${schemaType(page)}",
  "name": "${TITLE_TOKEN}",
  "url": "${page.url}",
  "publisher": { "@type": "Organization", "name": "${ctx.projectName}" },
  "dateModified": "${date}"
}
</script>`;
  return {
    check: "structured_data",
    where: "Pégalo dentro del <head> de esta página.",
    language: "html",
    snippet,
    placeholders: datePlaceholder ? [TITLE_TOKEN, date] : [TITLE_TOKEN]
  };
}

/**
 * Canonical is the one fix that is 100% real: the audit already resolved the
 * page's own absolute URL, so there is nothing left for the user to fill in.
 */
function canonicalFix(page: PageAuditEntry): PageFix {
  return {
    check: "canonical",
    where: "Pégalo dentro del <head>. Ya lleva la URL de esta página.",
    language: "html",
    snippet: `<link rel="canonical" href="${page.url}" />`,
    placeholders: []
  };
}

function openGraphFix(page: PageAuditEntry, ctx: PageFixContext): PageFix {
  return {
    check: "open_graph",
    where: "Pégalo dentro del <head>.",
    language: "html",
    snippet: `<meta property="og:title" content="${TITLE_TOKEN}" />
<meta property="og:description" content="${DESCRIPTION_TOKEN}" />
<meta property="og:url" content="${page.url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${ctx.projectName}" />`,
    placeholders: [TITLE_TOKEN, DESCRIPTION_TOKEN]
  };
}

function descriptionFix(page: PageAuditEntry): PageFix {
  const measured = page.check?.metadata?.descriptionLength ?? 0;
  const where =
    measured > 0
      ? `Sustituye la meta description actual (${measured} caracteres). El objetivo son 50-160.`
      : "Pégalo dentro del <head>. El objetivo son 50-160 caracteres.";
  return {
    check: "description_length",
    where,
    language: "html",
    snippet: `<meta name="description" content="${DESCRIPTION_TOKEN}" />`,
    placeholders: [DESCRIPTION_TOKEN]
  };
}

function titleFix(page: PageAuditEntry): PageFix {
  const measured = page.check?.metadata?.titleLength ?? 0;
  const where =
    measured > 0
      ? `Sustituye el <title> actual (${measured} caracteres). El objetivo son 15-60.`
      : "Pégalo dentro del <head>. El objetivo son 15-60 caracteres.";
  return {
    check: "title_length",
    where,
    language: "html",
    snippet: `<title>${TITLE_TOKEN}</title>`,
    placeholders: [TITLE_TOKEN]
  };
}

function hreflangFix(page: PageAuditEntry, ctx: PageFixContext): PageFix {
  return {
    check: "hreflang",
    where: "Solo si esta página existe en más de un idioma o país. Una línea por versión, dentro del <head>.",
    language: "html",
    snippet: `<link rel="alternate" hreflang="es-ES" href="${page.url}" />
<link rel="alternate" hreflang="en" href="https://${ctx.domainNormalized}/en/RUTA" />
<link rel="alternate" hreflang="x-default" href="${page.url}" />`,
    placeholders: ["RUTA"]
  };
}

function freshnessFix(page: PageAuditEntry): PageFix {
  const { value, isPlaceholder } = freshnessDate(page);
  return {
    check: "freshness",
    where: "Pégalo dentro del <head> para que se pueda detectar cuándo se actualizó.",
    language: "html",
    snippet: `<meta property="article:modified_time" content="${value}" />`,
    placeholders: isPlaceholder ? [value] : []
  };
}

const BUILDERS: Partial<Record<IssueCheckKey, (page: PageAuditEntry, ctx: PageFixContext) => PageFix>> = {
  structured_data: structuredDataFix,
  canonical: canonicalFix,
  open_graph: openGraphFix,
  description_length: descriptionFix,
  title_length: titleFix,
  hreflang: hreflangFix,
  freshness: freshnessFix
};

/**
 * The copyable fix for one failing check on one page, or null when that check
 * has no pasteable block.
 *
 * Deliberately null for `single_h1`, `two_h2`, `answer_first_intro`,
 * `list_or_table` and `content_length`: those are edits to the page's own
 * prose and structure. Emitting a snippet there would mean inventing the
 * user's content, which is the "fake product behavior" this repo forbids —
 * their existing prose guidance already says what to write. `noindex`,
 * `bot_blocked`, `llms_txt_missing` and `sitemap_missing` are site-wide, not
 * per-page, and belong to the domain-level fixes (fase 3a).
 */
export function buildPageFix(
  check: IssueCheckKey,
  page: PageAuditEntry,
  ctx: PageFixContext
): PageFix | null {
  if (page.status !== "analyzed" || !page.check) return null;
  const builder = BUILDERS[check];
  return builder ? builder(page, ctx) : null;
}

/** Every copyable fix this page currently needs, in the order the checks fail. */
export function buildPageFixes(
  failingChecks: IssueCheckKey[],
  page: PageAuditEntry,
  ctx: PageFixContext
): PageFix[] {
  const seen = new Set<IssueCheckKey>();
  const fixes: PageFix[] = [];
  for (const check of failingChecks) {
    if (seen.has(check)) continue;
    seen.add(check);
    const fix = buildPageFix(check, page, ctx);
    if (fix) fixes.push(fix);
  }
  return fixes;
}
