import { parseHTML } from "linkedom";
import { sanitizeField } from "@/lib/text/sanitize";

/**
 * AI-READ-2 (log §451): what a person sees on a page against what an AI bot
 * receives. The rendered HTML comes from a real browser (Cloudflare Browser
 * Run, `browser-run.ts`); the raw HTML is the same page asked without
 * JavaScript, like a bot. Same method as the Chrome extension's readAiView
 * (`docs/chrome-extension/prueba/extension/extras.js`): words of the rendered
 * main content, matched against a word bag of the raw HTML.
 *
 * Pure: no I/O, no clock (the caller stamps `measuredAt`).
 */

/** Kinds of content the console groups what is lost by. */
export type RenderKind = "price" | "faq" | "review" | "spec";
export const RENDER_KINDS: readonly RenderKind[] = ["price", "faq", "review", "spec"];

export type RenderKindCount = { seen: number; missing: number };

export type PageRender =
  | {
      state: "ok";
      measuredAt: string;
      /** Share (0-100) of the words a person sees that also arrive in the HTML. */
      pct: number;
      /** The previous measurement's pct, when this one replaced it. */
      prevPct?: number;
      words: number;
      kinds: Partial<Record<RenderKind, RenderKindCount>>;
      /** A few literal blocks that do not arrive, sanitized, at most MAX_SAMPLES. */
      samples: Array<{ kind: RenderKind | "text"; text: string }>;
    }
  | {
      /** The browser got a page we cannot compare (a challenge, an error, too little text). Not counted. */
      state: "unmeasured";
      measuredAt: string;
    };

const BLOCK = "h1,h2,h3,h4,h5,h6,p,li,dt,dd,blockquote,figcaption,td,th,summary,label";
const DROP = "script,style,template,svg,noscript,iframe";
const CHROME = "nav,header,footer,[aria-hidden=true],dialog";
/** Cookie banners, consent tools and modals are painted by scripts on every site: never «content». */
const NOISE_RE = /cookie|consent|gdpr|onetrust|didomi|cookiebot|cmp|modal|popup|newsletter/i;
const MONEY_RE = /(\d[\d.,]*\s?(€|eur\b|\$|£))|((€|\$|£)\s?\d)/i;
const FAQ_RE = /faq|preguntas|question|accordion|acordeon/i;
const REVIEW_RE = /review|rese[nñ]a|opinion|rating|valoraci|testimon|trustpilot|stars?\b|estrellas/i;

const MIN_SEEN_WORDS = 40;
export const MAX_SAMPLES = 6;

function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "");
}
function words(s: string): string[] {
  return fold(s).match(/[\p{L}\p{N}]{3,}/gu) ?? [];
}
/** Every token, prices included («24,90 €» is «24» and «90»). */
function tokens(s: string): string[] {
  return fold(s).match(/[\p{L}\p{N}]+/gu) ?? [];
}
function one(s: string | null | undefined): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

type El = {
  tagName: string;
  textContent: string | null;
  id?: string;
  className?: unknown;
  parentElement: El | null;
  querySelector(sel: string): El | null;
  querySelectorAll(sel: string): Iterable<El>;
  closest(sel: string): El | null;
  remove(): void;
  getAttribute(name: string): string | null;
};

function docOf(html: string): { body: El | null; querySelector(sel: string): El | null } {
  // A space before every tag: textContent joins neighbouring elements without
  // one, and «24,90 €</p><p>Envío» would read as a single word.
  const { document } = parseHTML(html.replace(/</g, " <")) as unknown as { document: { body: El | null; querySelector(sel: string): El | null } };
  return document;
}

/** Any ancestor (or the element) whose id/class says it matches `re`. */
function ancestorMatches(el: El, re: RegExp, depth = 6): boolean {
  let cur: El | null = el;
  for (let i = 0; cur && i < depth; i++, cur = cur.parentElement) {
    const tag = (cur.id ?? "") + " " + (typeof cur.className === "string" ? cur.className : "") + " " + (cur.getAttribute?.("data-section") ?? "");
    if (re.test(tag)) return true;
  }
  return false;
}

/** What a block is, from its text and where it sits. `null` is plain text. */
export function classifyBlock(el: El, text: string): RenderKind | null {
  const tag = el.tagName.toLowerCase();
  if (MONEY_RE.test(text) && words(text).length <= 30) return "price";
  if (tag === "summary" || el.closest("details") || (/\?\s*$/.test(text) && /^(h\d|dt|summary|button)$/.test(tag)) || ancestorMatches(el, FAQ_RE)) return "faq";
  if (ancestorMatches(el, REVIEW_RE)) return "review";
  if (tag === "td" || tag === "th" || tag === "dt" || tag === "dd") return "spec";
  return null;
}

function stripNoise(root: El | null): void {
  if (!root) return;
  for (const n of [...root.querySelectorAll(DROP)]) n.remove();
}

/**
 * Compares a page as a browser paints it (`renderedHtml`) with the same page
 * as a bot receives it (`rawHtml`).
 */
export function compareRender(rawHtml: string, renderedHtml: string, measuredAt: string): PageRender {
  const raw = docOf(rawHtml);
  stripNoise(raw.body);
  const rawText = raw.body?.textContent ?? "";
  const bag = new Map<string, number>();
  for (const w of words(rawText)) bag.set(w, (bag.get(w) ?? 0) + 1);
  const rawWords = [...bag.values()].reduce((a, b) => a + b, 0);
  // Blocks are matched by consecutive token pairs: «24 90» only exists where
  // the price does, while «24» alone is on half the web.
  const rawSeq = tokens(rawText);
  const rawTokens = new Set(rawSeq);
  const rawPairs = new Set(rawSeq.slice(1).map((t, i) => `${rawSeq[i]} ${t}`));

  const rendered = docOf(renderedHtml);
  stripNoise(rendered.body);
  const scope = rendered.querySelector("main,[role=main],article") ?? rendered.body;
  if (!scope) return { state: "unmeasured", measuredAt };

  const leaves = [...scope.querySelectorAll(BLOCK)]
    .slice(0, 2000)
    .filter((el) => !el.querySelector(BLOCK) && !el.closest(CHROME) && !ancestorMatches(el, NOISE_RE));

  const seen: string[] = [];
  const kinds: Partial<Record<RenderKind, RenderKindCount>> = {};
  const samples: Array<{ kind: RenderKind | "text"; text: string }> = [];
  const dup = new Set<string>();
  for (const el of leaves) {
    const text = one(el.textContent);
    const ws = words(text);
    const ts = tokens(text);
    if (ts.length === 0) continue;
    seen.push(...ws);
    const kind = classifyBlock(el, text);
    const pairs = ts.slice(1).map((t, i) => `${ts[i]} ${t}`);
    const found = pairs.length > 0 ? pairs.filter((p) => rawPairs.has(p)).length / pairs.length : Number(rawTokens.has(ts[0]));
    const gone = found < 0.5;
    if (kind) {
      const k = (kinds[kind] ??= { seen: 0, missing: 0 });
      k.seen += 1;
      if (gone) k.missing += 1;
    }
    if (gone && (ws.length >= 2 || kind === "price") && samples.length < MAX_SAMPLES) {
      const t = sanitizeField(text.length > 80 ? text.slice(0, 79).trim() + "…" : text, 120);
      if (!dup.has(t)) {
        dup.add(t);
        samples.push({ kind: kind ?? "text", text: t });
      }
    }
  }

  // A challenge page, an error page or a near-empty render cannot be compared:
  // a real browser never shows much less than the raw HTML holds.
  if (seen.length < MIN_SEEN_WORDS) return { state: "unmeasured", measuredAt };
  if (rawWords >= 80 && seen.length < rawWords * 0.25 && !/<(main|article)[\s>]/i.test(renderedHtml)) {
    return { state: "unmeasured", measuredAt };
  }

  const left = new Map(bag);
  let hits = 0;
  for (const w of seen) {
    const n = left.get(w);
    if (n) {
      hits++;
      left.set(w, n - 1);
    }
  }
  const pct = Math.round((hits / seen.length) * 100);
  // Samples of content kinds first: they are what the console can explain.
  samples.sort((a, b) => Number(a.kind === "text") - Number(b.kind === "text"));
  return { state: "ok", measuredAt, pct, words: seen.length, kinds, samples };
}

/** One week: what this measures changes when the site changes, and the free browser quota is small. */
export const RENDER_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
/** A page we could not compare is tried again after a day. */
export const RENDER_RETRY_MS = 24 * 60 * 60 * 1000;

/** Whether a page's measurement is still good at `now`. */
export function renderIsFresh(render: PageRender | undefined, now: Date): boolean {
  if (!render) return false;
  const age = now.getTime() - Date.parse(render.measuredAt);
  if (!Number.isFinite(age)) return false;
  return age < (render.state === "ok" ? RENDER_REFRESH_MS : RENDER_RETRY_MS);
}

/** Basic shape check for a value read back from the database. */
export function isPageRender(v: unknown): v is PageRender {
  if (!v || typeof v !== "object") return false;
  const r = v as { state?: unknown; measuredAt?: unknown; pct?: unknown };
  if (typeof r.measuredAt !== "string") return false;
  if (r.state === "unmeasured") return true;
  return r.state === "ok" && typeof r.pct === "number";
}
