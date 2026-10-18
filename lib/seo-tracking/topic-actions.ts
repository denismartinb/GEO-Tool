import type { KeywordView, TopResult, TopicView } from "@/lib/seo-tracking/view-model";

/**
 * SEO-TRACK-1 PR B (log §341): the «Qué hacer» of each topic, approved by the
 * founder with prototype v6 (docs/design-reference/seo-track-1/).
 *
 * Every step is a rule over data we already hold: the Monday Top 20 (titles,
 * domains, questions, map), the customer's own pages and title in it, the
 * backlink summary of the rivals and, when connected, the customer's Search
 * Console. No LLM and no reading of third-party pages (that would be a
 * crawler, not approved), so a step never claims what a page says inside.
 * A step never promises a position either.
 */

export type ActionType = "content" | "title" | "site" | "local" | "links";

export type TopicAction = {
  /** Code-built, stable while the situation lasts: rule and subject. Stored in `seo_action_states`. */
  key: string;
  type: ActionType;
  title: string;
  why: string;
  steps: string[];
  /** Where the data behind the step comes from, shown under it. */
  source: string;
};

export type RivalLinks = { domain: string; referringDomains: number | null };

export type CtrSignal = { query: string; page: string | null; position: number };

export type ActionInput = {
  topic: TopicView;
  ownDomain: string;
  rivals: RivalLinks[];
  ownReferringDomains: number | null;
  /** Search Console queries on page 1 with fewer clicks than the site's own norm. */
  ctr: CtrSignal[];
};

export const MAX_ACTIONS_PER_TOPIC = 4;
const MAX_QUESTIONS_IN_STEP = 3;
/** A term counts as «what the Top 10 says» when at least half of its titles carry it. */
const TITLE_TERM_SHARE = 0.5;
/** Rivals with this many times the customer's linking sites make links the brake. */
const LINK_GAP_RATIO = 3;
const DROP_MIN = 3;

const SRC_TOP = "Top 10 de Google del lunes";
const SRC_TOP20 = "Top 20 de Google del lunes";
const SRC_PAGES = "Tus páginas en el Top 20";
const SRC_LINKS = "Enlaces según DataForSEO";
const SRC_GSC = "Tu Search Console, últimos 28 días";

const STOPWORDS = new Set([
  "de", "del", "la", "las", "el", "los", "en", "para", "por", "con", "sin", "una", "uno", "unos", "unas", "que", "qué",
  "como", "cómo", "cual", "cuál", "mas", "más", "mejor", "mejores", "y", "o", "a", "al", "lo", "su", "sus", "tu", "tus"
]);

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es-ES");
}

function terms(text: string): string[] {
  return fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** Path shown to the customer: «/implantes», «/» for the home page. */
export function pagePath(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    return path || "/";
  } catch {
    return url;
  }
}

function sameSite(domain: string, ownDomain: string): boolean {
  const d = domain.replace(/^www\./, "");
  const own = ownDomain.replace(/^www\./, "");
  return d === own || d.endsWith(`.${own}`);
}

function quote(keyword: string): string {
  return `«${keyword}»`;
}

/**
 * Words of the keyword that at least half of the Top 10 titles carry and the
 * own title does not. Only words of the keyword itself: anything else would
 * be guessing at what the page should say.
 */
export function missingTitleTerms(keyword: string, ownTitle: string | null, top10: TopResult[]): { term: string; share: number }[] {
  if (!ownTitle) return [];
  const titles = top10.map((r) => r.title).filter((t): t is string => !!t);
  if (titles.length < 5) return [];
  const own = new Set(terms(ownTitle));
  return [...new Set(terms(keyword))]
    .filter((term) => !own.has(term))
    .map((term) => ({ term, share: titles.filter((t) => terms(t).includes(term)).length / titles.length }))
    .filter((m) => m.share >= TITLE_TERM_SHARE)
    .sort((a, b) => b.share - a.share);
}

function shareText(share: number): string {
  return `${Math.round(share * 10)} de cada 10 resultados del Top 10`;
}

function questionStep(questions: string[], page: string | null): string | null {
  if (!questions.length) return null;
  const list = questions.slice(0, MAX_QUESTIONS_IN_STEP).map((q) => `«${q.replace(/^¿|\?$/g, "")}»`).join(", ");
  return `Responde en ${page ?? "la página"} las preguntas que enseña Google, cada una con su encabezado: ${list}.`;
}

/** The page the topic is worked with: the one set on the topic, or the own URL that ranks most often. */
function mainPage(topic: TopicView): string | null {
  if (topic.targetUrl) return pagePath(topic.targetUrl);
  const counts = new Map<string, number>();
  for (const k of topic.keywords) if (k.url) counts.set(pagePath(k.url), (counts.get(pagePath(k.url)) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

function frequentDomains(keywords: KeywordView[], ownDomain: string, limit: number): string[] {
  const counts = new Map<string, number>();
  for (const k of keywords) for (const r of k.top10) if (!sameSite(r.domain, ownDomain)) counts.set(r.domain, (counts.get(r.domain) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([d]) => d.replace(/^www\./, ""));
}

export function buildTopicActions(input: ActionInput): TopicAction[] {
  const { topic, ownDomain } = input;
  const seen = topic.keywords.filter((k) => k.state === "ok");
  if (!seen.length) return [];
  const page = mainPage(topic);
  const out: TopicAction[] = [];
  let questionsUsed = false;
  const titleTermsUsed = new Set<string>();

  // 1 · No page of the site ranks for any keyword of the topic.
  const ranking = seen.filter((k) => k.position !== null);
  if (!ranking.length) {
    const lead = seen[0].keyword;
    const domains = frequentDomains(seen, ownDomain, 3);
    const steps = [
      `Haz una página dedicada a este tema${topic.targetUrl ? ` (${pagePath(topic.targetUrl)})` : ""} y ponle ${quote(lead)} en el título y en el primer encabezado.`,
      questionStep(topic.questions, null),
      "Enlázala desde tu portada y desde el menú, para que Google la encuentre."
    ].filter((s): s is string => !!s);
    questionsUsed = topic.questions.length > 0;
    out.push({
      key: "create_page",
      type: "content",
      title: "Crea una página para este tema",
      why: `Ninguna página tuya sale en el Top 20 de estas búsquedas.${domains.length ? ` Los que más se repiten en el Top 10: ${domains.join(", ")}.` : ""}`,
      steps,
      source: SRC_TOP20
    });
  }

  // 2 · The keyword closest to page 1 (positions 11-20).
  const near = ranking.filter((k) => (k.position as number) > 10).sort((a, b) => (a.position as number) - (b.position as number))[0];
  if (near) {
    const missing = missingTitleTerms(near.keyword, near.title, near.top10)[0];
    const at = near.url ? pagePath(near.url) : page;
    const steps = [
      missing ? `En ${at}, pon «${missing.term}» en el título y en el primer encabezado.` : `Asegúrate de que ${at} responde a ${quote(near.keyword)} en sus primeras líneas.`,
      questionStep(topic.questions, at)
    ].filter((s): s is string => !!s);
    if (missing) titleTermsUsed.add(`${at}|${missing.term}`);
    if (topic.questions.length) questionsUsed = true;
    const gap = (near.position as number) - 10;
    out.push({
      key: `near_page_one:${near.keyword}`,
      type: "content",
      title: `Lleva ${quote(near.keyword)} del puesto ${near.position} a la página 1`,
      why: `Es la palabra del tema más cerca de la página 1: le ${gap === 1 ? "falta 1 puesto" : `faltan ${gap} puestos`}.${
        missing ? ` ${shareText(missing.share)} llevan «${missing.term}» en el título; el de ${at} no.` : ""
      }`,
      steps,
      source: missing ? `${SRC_TOP} y el título con el que sales` : SRC_TOP
    });
  }

  // 3 · Several own pages share the topic.
  const urls = [...new Set(ranking.map((k) => pagePath(k.url ?? "")).filter(Boolean))];
  if (urls.length >= 2) {
    const main = page && urls.includes(page) ? page : urls[0];
    const others = urls.filter((u) => u !== main);
    const examples = others
      .map((u) => ranking.find((k) => k.url && pagePath(k.url) === u))
      .filter((k): k is KeywordView => !!k)
      .slice(0, 2)
      .map((k) => `${quote(k.keyword)} sale con ${pagePath(k.url as string)}`);
    const anchor = (ranking.find((k) => k.url && pagePath(k.url) === main) ?? ranking[0]).keyword;
    out.push({
      key: `split_pages:${[...urls].sort().join(",")}`,
      type: "site",
      title: "Varias páginas tuyas se reparten el tema",
      why: `${examples.join(" y ")}, y la página del tema es ${main}. Google no ve una página clara para el tema.`,
      steps: [
        `Desde ${others.join(" y ")}, enlaza a ${main} con el texto ${quote(anchor)}.`,
        `Deja cada página para su duda concreta y la explicación general en ${main}.`
      ],
      source: SRC_PAGES
    });
  }

  // 4 · Search Console: on page 1, fewer clicks than the site's own norm.
  const keywordSet = new Set(topic.keywords.map((k) => k.keyword));
  const ctr = input.ctr.find((c) => keywordSet.has(c.query));
  if (ctr) {
    const at = ctr.page ? pagePath(ctr.page) : page ?? "la página";
    out.push({
      key: `ctr:${ctr.query}`,
      type: "title",
      title: `Mejora el título y la descripción de ${at}`,
      why: `Sales en el puesto ${Math.round(ctr.position)} en ${quote(ctr.query)}, pero recibes menos clics de lo habitual en tu web para ese puesto.`,
      steps: [
        `Pon en el título lo que busca quien escribe ${quote(ctr.query)}, con las mismas palabras.`,
        "Reescribe la descripción con una razón concreta para entrar en tu página."
      ],
      source: SRC_GSC
    });
  }

  // 5 · On page 1 already, but the title lacks a word the Top 10 shares.
  for (const k of ranking.filter((x) => (x.position as number) <= 10)) {
    const at = k.url ? pagePath(k.url) : null;
    const missing = at ? missingTitleTerms(k.keyword, k.title, k.top10).find((m) => !titleTermsUsed.has(`${at}|${m.term}`)) : undefined;
    if (!missing || !at) continue;
    out.push({
      key: `title_term:${at}:${missing.term}`,
      type: "title",
      title: `Añade «${missing.term}» al título de ${at}`,
      why: `Sales en el puesto ${k.position} en ${quote(k.keyword)}. ${shareText(missing.share)} llevan «${missing.term}» en el título; el tuyo no.`,
      steps: [`Cambia el título de ${at} para que diga «${missing.term}» sin perder lo que ya dice.`],
      source: `${SRC_TOP} y el título con el que sales`
    });
    break;
  }

  // 6 · A keyword that fell this week.
  const dropped = ranking
    .concat(seen.filter((k) => k.position === null && typeof k.previous === "number"))
    .filter((k) => typeof k.previous === "number" && (k.position === null || (k.position as number) - (k.previous as number) >= DROP_MIN))
    .sort((a, b) => (b.position ?? 21) - (b.previous as number) - ((a.position ?? 21) - (a.previous as number)))[0];
  if (dropped) {
    const before = new Set((dropped.previousTop10 ?? []).map((r) => r.domain));
    const entered = dropped.top10
      .filter((r) => !before.has(r.domain) && !sameSite(r.domain, ownDomain) && (dropped.position === null || r.position < (dropped.position as number)))
      .map((r) => r.domain.replace(/^www\./, ""))
      .slice(0, 3);
    out.push({
      key: `dropped:${dropped.keyword}`,
      type: "site",
      title: `${quote(dropped.keyword)} ha bajado esta semana`,
      why: `Ha pasado del puesto ${dropped.previous} ${dropped.position === null ? "a fuera del Top 20" : `al ${dropped.position}`}.${
        entered.length ? ` Han entrado por delante: ${entered.join(", ")}.` : ""
      }`,
      steps: [
        entered.length
          ? `Abre las páginas que han entrado y compáralas con la tuya: qué preguntas responden y qué datos dan.`
          : "Comprueba que tu página sigue publicada, sin cambios recientes que la hayan empeorado.",
        "Si la semana que viene sigue bajando, refuerza la página con lo que les falte frente a las de delante."
      ],
      source: SRC_TOP
    });
  }

  // 7 · Google shows the map.
  const local = seen.find((k) => k.localPack);
  if (local) {
    out.push({
      key: "local_pack",
      type: "local",
      title: "Completa tu ficha de Google",
      why: `En ${quote(local.keyword)} sale el mapa de Google con negocios de la zona. Ahí se entra con tu Perfil de Empresa, no con tu página.`,
      steps: [
        `En tu Perfil de Empresa de Google, añade el servicio de este tema con una descripción.`,
        "Sube fotos reales y pide reseña a tus clientes de este servicio."
      ],
      source: SRC_TOP20
    });
  }

  // 8 · Questions Google shows, if no step above already uses them.
  if (!questionsUsed && topic.questions.length) {
    out.push({
      key: "questions",
      type: "content",
      title: "Responde lo que la gente pregunta en Google",
      why: "Google enseña estas preguntas en las búsquedas del tema, en el bloque «Otras preguntas de los usuarios».",
      steps: [questionStep(topic.questions, page) as string],
      source: SRC_TOP
    });
  }

  // 9 · Rivals in the Top 10 with many more linking sites.
  const rivalsHere = input.rivals.filter(
    (r) => r.referringDomains !== null && seen.some((k) => k.top10.some((t) => sameSite(t.domain, r.domain)))
  );
  const own = input.ownReferringDomains;
  if (own !== null && rivalsHere.length) {
    const avg = rivalsHere.reduce((a, r) => a + (r.referringDomains as number), 0) / rivalsHere.length;
    const ratio = avg / Math.max(1, own);
    if (ratio >= LINK_GAP_RATIO) {
      const rivalSet = new Set(input.rivals.map((r) => r.domain.replace(/^www\./, "")));
      const places = frequentDomains(seen, ownDomain, 6).filter((d) => !rivalSet.has(d)).slice(0, 3);
      out.push({
        key: "links",
        type: "links",
        title: `Consigue enlaces hacia ${page ?? "la página del tema"}`,
        why: `Tus rivales que salen aquí tienen de media ${Math.round(ratio)} veces más webs que les enlazan. Con tan pocos enlaces, mejorar la página sólo sube hasta cierto punto.`,
        steps: [
          places.length
            ? `Pide aparecer en las webs que ya salen en el Top 10 de este tema y no son rivales: ${places.join(", ")}.`
            : "Pide aparecer en directorios y medios de tu sector con un enlace a la página.",
          "Ofrece a un medio o asociación de tu sector un dato o una guía con enlace a la página."
        ],
        source: SRC_LINKS
      });
    }
  }

  return out.slice(0, MAX_ACTIONS_PER_TOPIC);
}

const RANK: Record<string, number> = { near_page_one: 0, create_page: 1, ctr: 2, split_pages: 3, dropped: 4, title_term: 5, local_pack: 6, questions: 7, links: 8 };

/** Rank of a step, for picking the «Qué hacer esta semana» of the Resumen. */
export function actionRank(action: TopicAction): number {
  return RANK[action.key.split(":")[0]] ?? 9;
}
