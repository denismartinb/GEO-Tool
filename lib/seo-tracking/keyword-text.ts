/**
 * SEO-TRACK-1 (log §341): one spelling per keyword, so «Herramienta  GEO » and
 * «herramienta geo» are the same row (`seo_keywords_uniq` is on the stored
 * text). Google treats case and repeated spaces as the same search.
 */
export const MAX_KEYWORD_CHARS = 200;

export function normalizeKeyword(raw: string): string | null {
  const text = raw.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es-ES");
  return text && text.length <= MAX_KEYWORD_CHARS ? text : null;
}

/** Normalizes, drops invalid ones and duplicates, keeps the first spelling's order. */
export function normalizeKeywordList(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const keyword = normalizeKeyword(item);
    if (keyword && !seen.has(keyword)) {
      seen.add(keyword);
      out.push(keyword);
    }
  }
  return out;
}
