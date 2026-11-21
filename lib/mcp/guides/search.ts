/**
 * MCP-GUIDES-1 (log §425): keyword search over GenScore's own guides, for
 * the MCP tool `buscar_guias`. Pure and in memory: BM25 over plain-text
 * chunks, no embeddings, no vector database and no cost per query. The
 * corpus is small (a few hundred chunks) and in Spanish, so accents are
 * folded, stopwords dropped and words cut to a short stem.
 */

export type GuideChunk = {
  /** Path on genscore.es, e.g. `/blog/que-fuentes-cita-la-ia`. */
  path: string;
  title: string;
  /** `##` section of the article, or the FAQ question; empty for the lede. */
  section: string;
  text: string;
  kind: "guia" | "estudio" | "glosario";
  /** ISO date of the article (published or last updated); null for glossary entries. */
  date: string | null;
};

const STOPWORDS = new Set(
  (
    "a al algo algun alguna algunas alguno algunos ante antes aqui asi aun cada como con contra cual cuales cuando de del desde donde dos el ella ellas ellos en entre era es esa esas ese eso esos esta estan estar este esto estos fue ha han hay hasta la las le les lo los mas me mi mis mucho muy nada ni no nos o otra otras otro otros para pero poco por porque que quien se sea ser si sin sobre su sus tambien tan te tener tiene tienen tu tus un una uno unos y ya yo " +
    "hacer hace puedo puede pueden quiero saber mejor mejores como cual cuanto cuanta the of and to in for is what how"
  ).split(" ")
);

/** Accent-free, lower-case word stems of a text, stopwords out. */
export function terms(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
}

/** Plural and the most common verb/gender endings off, then cut to 6 letters. */
export function stem(w: string): string {
  if (/^\d+$/.test(w)) return w;
  let s = w;
  if (s.length > 4 && s.endsWith("es")) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("s")) s = s.slice(0, -1);
  // «cita», «cite», «citan», «citen» → «cit». Never below three letters.
  if (s.length > 3) {
    const cut = s.replace(/(ar|er|ir|an|en|a|o|e)$/, "");
    if (cut.length >= 3) s = cut;
  }
  return s.slice(0, 6);
}

export type GuideIndex = {
  chunks: GuideChunk[];
  docs: Array<{ tf: Map<string, number>; len: number }>;
  df: Map<string, number>;
  avgLen: number;
};

/** Titles and section names count three times: they say what a chunk is about. */
export function buildIndex(chunks: GuideChunk[]): GuideIndex {
  const df = new Map<string, number>();
  const docs = chunks.map((c) => {
    const words = [...terms(`${c.title} ${c.section}`), ...terms(`${c.title} ${c.section}`), ...terms(`${c.title} ${c.section}`), ...terms(c.text)];
    const tf = new Map<string, number>();
    for (const w of words) tf.set(w, (tf.get(w) ?? 0) + 1);
    for (const w of tf.keys()) df.set(w, (df.get(w) ?? 0) + 1);
    return { tf, len: words.length };
  });
  const avgLen = docs.reduce((a, d) => a + d.len, 0) / Math.max(1, docs.length);
  return { chunks, docs, df, avgLen };
}

export type GuideHit = { chunk: GuideChunk; score: number };

/**
 * The best chunks for a query, at most `perArticle` from the same page so
 * one long article does not fill the answer. A chunk must match every
 * term of a one- or two-word query and at least half of a longer one, so a
 * stray common word («precio») does not drag in an unrelated guide.
 */
export function searchGuides(index: GuideIndex, query: string, limit = 4, perArticle = 2): GuideHit[] {
  const q = [...new Set(terms(query))];
  if (!q.length) return [];
  const N = index.docs.length;
  const k1 = 1.4;
  const b = 0.75;
  const minMatched = q.length <= 2 ? q.length : Math.ceil(q.length / 2);
  const scored: GuideHit[] = [];
  index.docs.forEach((d, i) => {
    let score = 0;
    let matched = 0;
    for (const t of q) {
      const f = d.tf.get(t);
      if (!f) continue;
      matched++;
      const n = index.df.get(t) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / index.avgLen)));
    }
    if (matched >= minMatched) scored.push({ chunk: index.chunks[i], score });
  });
  scored.sort((a, b2) => b2.score - a.score);
  const perPath = new Map<string, number>();
  const hits: GuideHit[] = [];
  for (const h of scored) {
    const used = perPath.get(h.chunk.path) ?? 0;
    if (used >= perArticle) continue;
    perPath.set(h.chunk.path, used + 1);
    hits.push(h);
    if (hits.length >= limit) break;
  }
  return hits;
}

/** A chunk cut at a sentence end near `max` characters, never mid-word. */
export function excerpt(text: string, max = 700): string {
  const flat = text.replace(/\s*\n+\s*/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "));
  if (end > max * 0.5) return cut.slice(0, end + 1);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}
