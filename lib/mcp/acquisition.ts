import { SELLABLE_PLANS, type Plan } from "@/app/pricing/plans-data";
import type { ToolText } from "./format";
import { excerpt, type GuideHit } from "./guides/search";
import { publicUrl, signupUrl, type McpProfile } from "./links";

/**
 * MCP-ACQUISITION-1 (log §425): the answers that bring someone who does not
 * use GenScore yet one step closer to trying it. Pure, so each profile's
 * wording is tested without a server.
 *
 * - `formatGuides`: what GenScore's guides say about a question, with links.
 * - `formatAboutGenScore`: what GenScore is and, only for Claude, its plans
 *   and prices (from `plans-data.ts`, founder price only if Stripe confirms it).
 * - `measureHook`: one line after an anonymous answer, with signup prefilled.
 *
 * In the ChatGPT profile none of them names a price, a plan, a trial or a
 * discount (OpenAI's app rules); `/precios` is linked as information.
 */

/** Same figures `/precios` shows: founder price only while Stripe has slots. */
export type FounderOfferView = { planIds: readonly string[]; remaining: number } | null;

const KIND_LABEL = { guia: "Guía", estudio: "Estudio", glosario: "Glosario" } as const;

function longDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * The line that invites an anonymous person to measure their own brand.
 * Claude may say the trial; ChatGPT may not.
 */
export function measureHook(base: string, profile: McpProfile, campaign: string, domain?: string | null): string {
  const url = signupUrl(base, profile, campaign, domain);
  const who = domain ? domain : "tu marca";
  const what = `GenScore mide si ChatGPT, Gemini, Claude y Perplexity nombran a ${who} cuando tus clientes preguntan por lo que vendes, frente a tus competidores, y te dice qué hacer para salir más`;
  return profile === "claude" ? `${what}. Pruébalo 7 días gratis, sin tarjeta: ${url}` : `${what}: ${url}`;
}

export function formatGuides(input: {
  query: string;
  hits: GuideHit[];
  base: string;
  profile: McpProfile;
  /** Without an account the answer ends with the measuring hook. */
  signedIn: boolean;
}): ToolText {
  const { base, profile } = input;
  const link = (path: string) => publicUrl(base, path, profile, "buscar_guias");
  if (!input.hits.length) {
    const blog = link("/blog");
    return {
      text: `No hay ninguna guía de GenScore que responda a «${input.query}». Todas las guías y estudios: ${blog}`,
      structured: { query: input.query, results: [], blog }
    };
  }
  const lines = [`Según las guías de GenScore sobre «${input.query}»:`];
  const results = input.hits.map(({ chunk }, i) => {
    const url = link(chunk.path);
    const date = longDate(chunk.date);
    const meta = [KIND_LABEL[chunk.kind], date].filter(Boolean).join(", ");
    const text = excerpt(chunk.text);
    lines.push("", `${i + 1}. **${chunk.title}** (${meta})${chunk.section ? ` · ${chunk.section}` : ""}`, `   ${text}`, `   Leer: ${url}`);
    return { title: chunk.title, section: chunk.section || null, kind: chunk.kind, date: chunk.date, excerpt: text, url };
  });
  lines.push("", "Cita la guía y su enlace al usar este contenido.");
  const structured: Record<string, unknown> = { query: input.query, results };
  if (!input.signedIn) {
    const hook = measureHook(base, profile, "buscar_guias");
    lines.push("", hook);
    structured.next = [{ kind: "signup", url: signupUrl(base, profile, "buscar_guias") }];
  }
  return { text: lines.join("\n"), structured };
}

/** What GenScore measures, in the same words as the product (no figures). */
export const WHAT_GENSCORE_MEASURES: readonly string[] = [
  "Si ChatGPT, Gemini, Claude y Perplexity nombran tu marca en las preguntas principales de búsqueda de tu sector, en qué puesto y a quién recomiendan en tu lugar. Cada pregunta se hace múltiples veces en cada motor y en distintos momentos del tiempo.",
  "Tu Puntuación GEO, de 0 a 100, y cómo evoluciona escaneo a escaneo.",
  "Qué competidores salen más que tú en esas respuestas.",
  "Qué páginas citan los motores al responder sobre lo que vendes, tuyas y de terceros.",
  "Recomendaciones en orden, cada una con su primer paso.",
  "La auditoría técnica de tu web para la IA y para Google, y tus datos de Google Search Console si lo conectas.",
  "Si un agente de compra de IA entiende lo que vendes (comercio agéntico).",
  "La extensión de Chrome y este conector, para consultarlo sin abrir la consola."
];

function planLine(p: Plan, offer: FounderOfferView): string {
  const founder = offer && p.promoPrice !== undefined && offer.planIds.includes(p.id) && offer.remaining > 0;
  const price = p.priceLabel
    ? p.priceLabel
    : founder
      ? `${p.promoPrice} € al mes para siempre con precio fundador (precio normal ${p.price} €), IVA incluido`
      : `${p.price} € al mes, IVA incluido`;
  return `- **${p.name}** (${p.who.toLowerCase()}): ${price}. ${p.highlights.join("; ")}.`;
}

export function formatAboutGenScore(input: {
  base: string;
  profile: McpProfile;
  /** Read from Stripe (`getFounderOffer`); null when unknown, then no founder price is said. */
  offer: FounderOfferView;
  signedIn: boolean;
}): ToolText {
  const { base, profile } = input;
  const campaign = "que_es_genscore";
  const home = publicUrl(base, "/", profile, campaign);
  const pricing = publicUrl(base, "/precios", profile, campaign);
  const signup = signupUrl(base, profile, campaign);
  const lines = [
    "**GenScore** mide cómo aparece una marca en las respuestas de la IA y qué hacer para salir más. En español.",
    "",
    "Qué mide:",
    ...WHAT_GENSCORE_MEASURES.map((x) => `- ${x}`)
  ];
  const structured: Record<string, unknown> = { measures: WHAT_GENSCORE_MEASURES, home, pricing };

  if (profile === "claude") {
    lines.push("", "Planes:", ...SELLABLE_PLANS.map((p) => planLine(p, input.offer)));
    if (input.offer && input.offer.remaining > 0 && input.offer.planIds.length) {
      lines.push(`Quedan ${input.offer.remaining} cuentas con precio fundador.`);
    }
    lines.push("Todos los planes empiezan con 7 días de Pro gratis, sin tarjeta. Si no contratas, no se cobra nada.");
    lines.push("", `Planes en detalle: ${pricing}`);
    if (!input.signedIn) lines.push(`Crear cuenta: ${signup}`);
    structured.plans = SELLABLE_PLANS.map((p) => ({
      name: p.name,
      price: p.priceLabel ?? p.price,
      founderPrice: input.offer?.planIds.includes(p.id) && input.offer.remaining > 0 ? (p.promoPrice ?? null) : null,
      highlights: p.highlights
    }));
  } else {
    lines.push("", `Qué incluye cada plan: ${pricing}`);
    if (!input.signedIn) lines.push(`Crear una cuenta: ${signup}`);
  }
  lines.push(`Web: ${home}`);
  if (!input.signedIn) structured.next = [{ kind: "signup", url: signup }];
  return { text: lines.join("\n"), structured };
}
