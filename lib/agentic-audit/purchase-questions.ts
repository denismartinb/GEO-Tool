import { brandLabel, isBrandDomain } from "@/lib/domains/brand-domain";
import { getEngineMeta, normalizeProvider } from "@/lib/scan/engine-meta";
import { GROUNDED_PROVIDERS } from "@/lib/scoring/run-scoring";

/**
 * AGENTIC-COMMERCE-1 Fase 2d (log §330): «Preguntas de compra». Of the
 * questions a project already scans, the ones asked by someone about to buy,
 * and what the engines do with them: name the brand, cite its site, or send
 * the buyer to a marketplace. Pure and rule-based: no LLM, no extra call, the
 * same answer every time, and the screen can say in one line what counts.
 *
 * Design: docs/design-reference/agentic-commerce-1/fase-2d.html. The founder
 * chose the wide rule (2026-10-18): «recomiéndame / el mejor / busco» counts
 * too, because that is what an agent asks before buying; the strict rule
 * (where to buy and price only) left most projects under the sample floor.
 */

export type PurchaseReason = "where" | "price" | "choose";

/** Lower case, no accents, so «Dónde» and «donde» read the same. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
}

// «online» alone is not a purchase word: «reputación online» or «marketing
// online» are not someone buying. Only with comprar/tienda/pedir.
const WHERE =
  /\b(comprar|compro|compra online|tienda|tiendas|envio|envios|pedir online|pedido online|contratar|contrato|reservar|reservo|pedir cita|suscribirme|suscripcion|donde (me pongo|lo encuentro|puedo encontrar|voy)|a que \w+ (voy|acudo)|buy|where to buy|shop|order online|book a|hire|subscribe)\b/;

const PRICE =
  /\b(precio|precios|cuanto cuesta|cuanto vale|cuesta|coste|costo|barato|barata|baratos|baratas|economico|economica|oferta|ofertas|descuento|descuentos|gratis|gratuito|gratuita|calidad.precio|por menos de|tarifa|tarifas|presupuesto|price|prices|pricing|cost|cheap|affordable|discount|free)\b|€|\beuros?\b|\$/;

const CHOOSE =
  /\b(recomiendame|me recomiendas|recomiendas|recomendado|recomendada|recomendados|recomendadas|cual uso|cual compro|cual elijo|cual escojo|me compro|mejor|mejores|busco|necesito|recommend|best|looking for|which should i)\b/;

// How-to, definitions, differences, opinions and comparisons: not someone
// choosing what to buy, unless they also ask where or how much.
const NOT_BUYING =
  /^\W*(como|que es|que son|que significa|que diferencia|que diferencias|cual es la diferencia|diferencias|para que|por que|que opinan|que opinion|comparativa|comparacion|how|what does|what is an?|why)\b/;

/** Topic labels (lib/projects/prompt-categories.ts) that are purchase questions on their own. */
const PRICE_CATEGORIES = new Set(["precio y planes"]);

/** Why a question counts as a purchase question, or `null` when it does not. */
export function classifyPurchaseQuestion(text: string, category?: string | null): PurchaseReason | null {
  const q = fold(text);
  if (WHERE.test(q)) return "where";
  if (PRICE.test(q) || (category && PRICE_CATEGORIES.has(fold(category.trim())))) return "price";
  if (NOT_BUYING.test(q)) return null;
  if (CHOOSE.test(q)) return "choose";
  return null;
}

/** One line for the screen: what counts as a purchase question. */
export const PURCHASE_RULE_SENTENCE =
  "Cuenta como pregunta de compra la que pide dónde comprar o contratar, un precio, o qué elegir para comprarlo.";

/**
 * Fixed list of marketplaces and third-party platforms where the purchase or
 * booking happens. `label` is the registrable label of their domains (any
 * TLD); `names` are matched as words in the answer text, with their capital.
 */
export const MARKETPLACES: ReadonlyArray<{ name: string; label: string; names: string[] }> = [
  { name: "Amazon", label: "amazon", names: ["Amazon"] },
  { name: "eBay", label: "ebay", names: ["eBay"] },
  { name: "AliExpress", label: "aliexpress", names: ["AliExpress", "Aliexpress"] },
  { name: "Temu", label: "temu", names: ["Temu"] },
  { name: "Shein", label: "shein", names: ["Shein", "SHEIN"] },
  { name: "Miravia", label: "miravia", names: ["Miravia"] },
  { name: "Zalando", label: "zalando", names: ["Zalando"] },
  { name: "Etsy", label: "etsy", names: ["Etsy"] },
  { name: "Wallapop", label: "wallapop", names: ["Wallapop"] },
  { name: "Vinted", label: "vinted", names: ["Vinted"] },
  { name: "Milanuncios", label: "milanuncios", names: ["Milanuncios"] },
  { name: "PcComponentes", label: "pccomponentes", names: ["PcComponentes", "PCComponentes"] },
  { name: "MediaMarkt", label: "mediamarkt", names: ["MediaMarkt", "Media Markt"] },
  { name: "Fnac", label: "fnac", names: ["Fnac", "FNAC"] },
  { name: "Booking", label: "booking", names: ["Booking.com", "Booking"] },
  { name: "Airbnb", label: "airbnb", names: ["Airbnb"] },
  { name: "TheFork", label: "thefork", names: ["TheFork", "El Tenedor", "ElTenedor"] },
  { name: "TheFork", label: "eltenedor", names: [] },
  { name: "Doctoralia", label: "doctoralia", names: ["Doctoralia"] },
  { name: "Top Doctors", label: "topdoctors", names: ["Top Doctors", "TopDoctors"] },
  { name: "Treatwell", label: "treatwell", names: ["Treatwell"] },
  { name: "Fiverr", label: "fiverr", names: ["Fiverr"] },
  { name: "Glovo", label: "glovo", names: ["Glovo"] },
  { name: "Just Eat", label: "just-eat", names: ["Just Eat"] },
  { name: "Uber Eats", label: "ubereats", names: ["Uber Eats"] }
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const NAME_PATTERNS = MARKETPLACES.flatMap((m) =>
  m.names.map((n) => ({ name: m.name, label: m.label, re: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(n)}(?![\\p{L}\\p{N}])`, "u") }))
);

export type PurchaseCitation = { domain?: string | null; source?: "grounding" | "inline" | null };

/** Marketplaces an answer names or cites. The project's own marketplace never counts. */
export function marketplacesIn(rawText: string | null, citations: readonly PurchaseCitation[], ownDomain: string): string[] {
  const own = brandLabel(ownDomain);
  const found = new Set<string>();
  for (const c of citations) {
    const label = c.domain ? brandLabel(c.domain) : "";
    const m = label ? MARKETPLACES.find((x) => x.label === label) : undefined;
    if (m && m.label !== own) found.add(m.name);
  }
  if (rawText) {
    for (const p of NAME_PATTERNS) if (p.label !== own && p.re.test(rawText)) found.add(p.name);
  }
  return [...found];
}

export type PurchaseAnswer = {
  promptId: string;
  promptText: string;
  topic: string | null;
  provider: string | null;
  rawText: string | null;
  brandMentioned: boolean;
  citations: readonly PurchaseCitation[];
};

/** What one engine did with one question. `cited` is null for an engine that does not search the web. */
export type PurchaseOutcome = { named: boolean; cited: boolean | null; marketplaces: string[] };

export type PurchaseQuestion = {
  promptId: string;
  text: string;
  reason: PurchaseReason;
  byEngine: Record<string, PurchaseOutcome>;
};

export type PurchaseFigures = {
  answers: number;
  named: number;
  /** Share among answers of engines that search the web; null when there are none. */
  cited: number | null;
  marketplace: number;
};

export type PurchaseQuestionsReport = {
  totalQuestions: number;
  questions: PurchaseQuestion[];
  /** Below the floor there are questions but no percentages. */
  enough: boolean;
  figures: PurchaseFigures | null;
  byEngine: Array<{ provider: string } & PurchaseFigures>;
  topMarketplace: string | null;
  example: string | null;
};

/** Sample floor: fewer questions or answers move too much from one scan to the next. */
export const PURCHASE_MIN_QUESTIONS = 3;
export const PURCHASE_MIN_ANSWERS = 10;

/** Display order of engines across the console. */
const ENGINE_ORDER = ["openai", "gemini", "claude", "perplexity"];

export function engineRank(provider: string): number {
  const i = ENGINE_ORDER.indexOf(provider);
  return i === -1 ? ENGINE_ORDER.length : i;
}

function isGrounded(provider: string): boolean {
  return GROUNDED_PROVIDERS.has(provider);
}

function figuresOf(outcomes: Array<{ provider: string; o: PurchaseOutcome }>): PurchaseFigures {
  const grounded = outcomes.filter((x) => isGrounded(x.provider));
  const share = (n: number, d: number) => (d === 0 ? 0 : n / d);
  return {
    answers: outcomes.length,
    named: share(outcomes.filter((x) => x.o.named).length, outcomes.length),
    cited: grounded.length === 0 ? null : share(grounded.filter((x) => x.o.cited).length, grounded.length),
    marketplace: share(outcomes.filter((x) => x.o.marketplaces.length > 0).length, outcomes.length)
  };
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

/**
 * «¿Dónde comprar…?»: Gemini cita tu web; ChatGPT y Perplexity mandan a Amazon.
 * Template over the data of one question, the one where engines differ most.
 */
function exampleSentence(questions: PurchaseQuestion[]): string | null {
  let best: { q: PurchaseQuestion; parts: string[]; score: number } | null = null;
  for (const q of questions) {
    const groups = new Map<string, string[]>();
    for (const [provider, o] of Object.entries(q.byEngine).sort(([a], [b]) => engineRank(a) - engineRank(b))) {
      const name = getEngineMeta(provider).label;
      const verb = o.cited
        ? "cita tu web"
        : o.named
          ? "te nombra"
          : o.marketplaces.length > 0
            ? `manda a ${joinNames(o.marketplaces.slice(0, 2))}`
            : null;
      if (!verb) continue;
      groups.set(verb, [...(groups.get(verb) ?? []), name]);
    }
    if (groups.size === 0) continue;
    const parts = [...groups.entries()].map(([verb, names]) => {
      const plural = names.length > 1;
      const v = plural ? verb.replace(/^cita /, "citan ").replace(/^te nombra/, "te nombran").replace(/^manda /, "mandan ") : verb;
      return `${joinNames(names)} ${v}`;
    });
    const score = groups.size * 10 + parts.length;
    if (!best || score > best.score) best = { q, parts, score };
  }
  return best ? `«${best.q.text}»: ${best.parts.join("; ")}.` : null;
}

/**
 * Purchase questions of one scan. Answers without extracted data must be
 * left out by the caller: counting them as «not named» would invent a miss.
 */
export function buildPurchaseQuestions(
  answers: readonly PurchaseAnswer[],
  { domain, totalQuestions }: { domain: string; totalQuestions: number }
): PurchaseQuestionsReport {
  const byPrompt = new Map<string, PurchaseQuestion>();
  const outcomes: Array<{ provider: string; o: PurchaseOutcome }> = [];
  for (const a of answers) {
    const reason = classifyPurchaseQuestion(a.promptText, a.topic);
    if (!reason) continue;
    const provider = normalizeProvider(a.provider);
    const cited = isGrounded(provider)
      ? a.citations.some((c) => c.source === "grounding" && isBrandDomain(c.domain, domain))
      : null;
    const o: PurchaseOutcome = { named: a.brandMentioned, cited, marketplaces: marketplacesIn(a.rawText, a.citations, domain) };
    const q = byPrompt.get(a.promptId) ?? { promptId: a.promptId, text: a.promptText, reason, byEngine: {} };
    q.byEngine[provider] = o;
    byPrompt.set(a.promptId, q);
    outcomes.push({ provider, o });
  }

  const questions = [...byPrompt.values()];
  const enough = questions.length >= PURCHASE_MIN_QUESTIONS && outcomes.length >= PURCHASE_MIN_ANSWERS;
  const providers = [...new Set(outcomes.map((x) => x.provider))].sort((a, b) => engineRank(a) - engineRank(b));

  const counts = new Map<string, number>();
  for (const x of outcomes) for (const m of x.o.marketplaces) counts.set(m, (counts.get(m) ?? 0) + 1);
  const topMarketplace = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    totalQuestions,
    questions,
    enough,
    figures: enough ? figuresOf(outcomes) : null,
    byEngine: enough ? providers.map((provider) => ({ provider, ...figuresOf(outcomes.filter((x) => x.provider === provider)) })) : [],
    topMarketplace,
    example: exampleSentence(questions)
  };
}
