/**
 * Sitemap parsing (WEB-AUDIT-SITEMAP-1).
 *
 * Pure, no I/O: `robots.ts` ALREADY downloads `/sitemap.xml` to decide
 * `sitemapFound` and then throws the bytes away. This module reads those same
 * bytes, so the whole feature costs **zero additional network requests**.
 *
 * That is not a performance footnote, it is the scope boundary. This zone is
 * "adyacente a crawler", which `CLAUDE.md` forbids without its own approval
 * (see `.claude/rules/web-audit.md`). Parsing bytes we already hold does not
 * widen the fetch surface. FOLLOWING a sitemap index to its child sitemaps
 * WOULD — it is link-following by definition — so this deliberately does not,
 * and reports "index" as its own honest state instead of pretending to know
 * what is inside.
 *
 * ---------------------------------------------------------------------------
 * WHAT WE CAN AND CANNOT CLAIM
 * ---------------------------------------------------------------------------
 * `robots.ts` caps the download at 128 KB. A real sitemap can hold 50.000
 * URLs and be several MB, so what we parse may be a PREFIX of the file. Any
 * count derived from it is therefore a FLOOR, never a total — `truncated`
 * says so, and every caller must render it as "al menos N" rather than "N".
 * Reporting a truncated count as a fact would be a fabricated metric.
 *
 * Deliberately a tolerant regex scan and not an XML parser: the input is
 * untrusted bytes from someone else's server, an XML parser is a dependency
 * plus an entity-expansion attack surface, and we need exactly one thing from
 * it — the `<loc>` values. Malformed XML that a browser would still render is
 * common in the wild and should not read as "no sitemap".
 */

export type SitemapKind =
  /** `<urlset>` — a normal sitemap listing pages. */
  | "urlset"
  /** `<sitemapindex>` — a list of OTHER sitemaps. Their contents are not fetched. */
  | "index"
  /**
   * Reachable, but not a sitemap. Overwhelmingly this is a soft 404: a
   * server that answers `/sitemap.xml` with its HTML error page and a 200,
   * which the old presence-only check happily counted as "found".
   */
  | "invalid";

export type SitemapReport = {
  kind: SitemapKind;
  /**
   * `<loc>` entries seen in the bytes we read. A FLOOR when `truncated` — see
   * this file's header. Zero for `invalid`.
   */
  locCount: number;
  /** True when the download hit the byte cap, so the file continues past what we parsed. */
  truncated: boolean;
  /**
   * The `<loc>` values themselves, capped — used to tell the user which of
   * their audited pages are missing from their own sitemap. Not persisted in
   * full: only the derived comparison is.
   */
  locs: string[];
};

/** Enough to cross-check the audited pages (max 10) with room to spare, without bloating the snapshot. */
const MAX_LOCS_KEPT = 500;

/**
 * Mirrors `TXT_MAX_BYTES` in robots.ts. When the body we received is at or
 * above the cap the file almost certainly continues — "almost" because a file
 * of exactly the cap size is indistinguishable, and erring toward "truncated"
 * only ever makes us claim LESS.
 */
const BYTE_CAP = 128 * 1024;

const LOC_RE = /<loc\b[^>]*>([\s\S]*?)<\/loc>/gi;

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    // Ampersand LAST, so "&amp;lt;" decodes to "&lt;" and not to "<".
    .replace(/&amp;/g, "&");
}

/**
 * `content` is the raw text `robots.ts` already fetched, or null when
 * `/sitemap.xml` was unreachable. Returns null in that case so the caller
 * keeps its existing "not found" branch unchanged.
 */
export function parseSitemap(content: string | null): SitemapReport | null {
  if (content === null) return null;

  const truncated = Buffer.byteLength(content, "utf-8") >= BYTE_CAP;

  // Strip comments before sniffing: a commented-out <urlset> must not decide
  // the kind, and commented-out <loc> entries must not be counted.
  const body = content.replace(/<!--[\s\S]*?-->/g, "");

  const isIndex = /<sitemapindex\b/i.test(body);
  const isUrlset = /<urlset\b/i.test(body);

  if (!isIndex && !isUrlset) {
    return { kind: "invalid", locCount: 0, truncated, locs: [] };
  }

  const locs: string[] = [];
  let locCount = 0;
  for (const match of body.matchAll(LOC_RE)) {
    const url = decodeEntities(match[1]).trim();
    if (!url) continue;
    locCount += 1;
    if (locs.length < MAX_LOCS_KEPT) locs.push(url);
  }

  // A sitemapindex whose bytes also contain <urlset> is malformed; treat it as
  // an index, which is the weaker (less claimed) reading.
  return { kind: isIndex ? "index" : "urlset", locCount, truncated, locs };
}

function normalizeForCompare(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    url.search = "";
    url.protocol = "https:";
    url.hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : "/";
    return `${url.hostname}${path}`;
  } catch {
    return null;
  }
}

/**
 * Which of the audited pages do NOT appear in the sitemap.
 *
 * This is the part that is actually worth knowing: a key page missing from
 * your own sitemap is a concrete, fixable gap, whereas a raw URL count says
 * nothing about whether the RIGHT pages are in there.
 *
 * Returns null — "we cannot tell" — rather than a misleading list whenever
 * the answer would not be trustworthy:
 *   - a sitemap INDEX: the pages live in child sitemaps we deliberately do
 *     not fetch, so everything would look "missing";
 *   - a TRUNCATED file: a page could easily be in the part we never read;
 *   - `invalid`: there is nothing to compare against.
 *
 * Never guessing here is the whole point — "estas 4 páginas no están en tu
 * sitemap" is a claim the user will act on.
 */
export function pagesMissingFromSitemap(
  report: SitemapReport | null,
  auditedUrls: string[]
): string[] | null {
  if (!report || report.kind !== "urlset" || report.truncated) return null;

  const inSitemap = new Set(
    report.locs.map(normalizeForCompare).filter((v): v is string => v !== null)
  );

  return auditedUrls.filter((url) => {
    const key = normalizeForCompare(url);
    // An unparseable audited URL cannot be proven missing, so it is not
    // reported as missing.
    return key !== null && !inSitemap.has(key);
  });
}

export type SitemapStep = {
  title: string;
  body: string;
  code?: string;
};

/**
 * How to get a sitemap, when there is none.
 *
 * Deliberately NOT a generator, unlike fase 3a's llms.txt — and the difference
 * is not effort, it is what the artifact IS. An llms.txt is a curated guide; a
 * human maintaining it by hand is the normal case. A sitemap is a
 * machine-generated index that must track the site: a static file we hand over
 * is stale the moment they publish anything, and we would have built it from
 * the ~15 URLs we happen to know out of their several hundred.
 *
 * In 2026 a site without a sitemap almost never needs one written — it needs
 * one switched on. So these steps point at the switch, per platform, and end
 * where every set of instructions in this product ends: at a URL the user
 * opens themselves, so success is something they SEE.
 */
export function sitemapSteps(domainNormalized: string): SitemapStep[] {
  return [
    {
      title: "Casi seguro que tu plataforma ya lo genera",
      body:
        "No hace falta escribir el fichero a mano, y no deberías: un sitemap tiene que actualizarse solo " +
        "cada vez que publicas. En WordPress lo genera Yoast o Rank Math (Ajustes → Funciones → Mapas del sitio). " +
        "En Shopify, Webflow y Squarespace ya existe y no se puede desactivar. En Next.js se añade un " +
        "fichero app/sitemap.ts. Busca el interruptor antes que el editor.",
      code: "app/sitemap.ts"
    },
    {
      title: "Decláralo en tu robots.txt",
      body:
        "Una línea al final del fichero. No es obligatorio, pero es como lo encuentran los rastreadores " +
        "que no prueban la ruta por defecto.",
      code: `Sitemap: https://${domainNormalized}/sitemap.xml`
    },
    {
      title: "Compruébalo tú mismo abriendo esta URL",
      body:
        "Debe mostrar XML con una lista de <loc>. Si sale tu página de error, un 404, o una página normal " +
        "de tu web, no lo tienes — aunque la dirección responda.",
      code: `https://${domainNormalized}/sitemap.xml`
    }
  ];
}
