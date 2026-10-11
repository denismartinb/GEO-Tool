import { TIERS, displayPath, tierOf } from "@/lib/search-console/insights";
import type {
  GoogleRecommendation,
  ImproveSnippet,
  PushToPageOne
} from "@/lib/search-console/recommendations";
import { fmtInt, fmtPct } from "../../search-console/_components/format";

/**
 * Copy of the Google cards in Recomendaciones (RECS-ONE-QUEUE-1, log §306,
 * design in docs/design-reference/recs-one-queue-1/). Pure: every sentence is
 * a template over the Google figures the card carries, never a claim we did
 * not read from Search Console.
 */

/** "/precios", or «tu Home» for the root: a bare "/" reads as a typo. */
export function pageName(url: string): string {
  const path = displayPath(url);
  return path === "/" ? "tu Home" : path;
}

export function joinPaths(urls: string[]): string {
  const paths = urls.map((u) => pageName(u));
  return paths.length <= 1 ? (paths[0] ?? "") : `${paths.slice(0, -1).join(", ")} y ${paths[paths.length - 1]}`;
}

function times(n: number): string {
  return `${fmtInt(n)} ${n === 1 ? "vez" : "veces"}`;
}

/** Google positions are averages; the card shows the place a person would see. */
export function placeLabel(position: number): string {
  return `${Math.max(1, Math.round(position))}º`;
}

function peersText(position: number): string {
  const tier = TIERS.find((t) => t.key === tierOf(position));
  return tier ? `en los ${tier.range.toLowerCase()}` : "en ese tramo";
}

/** Only the two kinds that ask the customer to change their site take a plan slot. */
export type GooglePlanRec = PushToPageOne | ImproveSnippet;

export function isPlanCandidate(rec: GoogleRecommendation): rec is GooglePlanRec {
  return rec.kind === "push_page_one" || rec.kind === "improve_snippet";
}

/** The Google card for the plan: page 1 first, then a better title, never «vigilar». */
export function pickPlanRec(recs: GoogleRecommendation[]): GooglePlanRec | null {
  return (
    (recs.find((r) => r.kind === "push_page_one") as PushToPageOne | undefined) ??
    (recs.find((r) => r.kind === "improve_snippet") as ImproveSnippet | undefined) ??
    null
  );
}

/** How the plan's summary line names what the Google card is worth. */
export function planGoal(kind: GooglePlanRec["kind"]): string {
  return kind === "push_page_one"
    ? "una búsqueda hacia la página 1 de Google"
    : "un título que atraiga más clics en Google";
}

export type PlanCopy = {
  kind: string;
  title: string;
  step: string;
  scope: string;
  metric: string;
  metricLabel: string;
  seen: string;
  why: string;
  queryMeta: string;
  steps: string[];
  after: string;
};

export function planCopy(rec: GooglePlanRec): PlanCopy {
  const scope = `1 búsqueda · ${fmtInt(rec.impressions)} ${rec.impressions === 1 ? "impresión" : "impresiones"} en 28 días`;
  const where = rec.page ? pageName(rec.page) : "la página que sale";

  if (rec.kind === "push_page_one") {
    const from = rec.linkFrom.slice(0, 2);
    return {
      kind: "Subir a la página 1",
      title: `Lleva «${rec.query}» a la primera página de Google`,
      step:
        from.length > 0
          ? `Enlaza ${where} desde ${joinPaths(from)}, con «${rec.query}» en el texto del enlace.`
          : `Responde a «${rec.query}» en las primeras líneas de ${where}.`,
      scope,
      metric: placeLabel(rec.position),
      metricLabel: "Puesto en Google",
      seen: `Google te enseña en el puesto ${Math.round(rec.position)} para esta búsqueda, en la segunda página. En 28 días te vieron ${times(rec.impressions)} al buscarla.`,
      why: "Casi todos los clics se quedan en la primera página. Enlazar desde páginas tuyas que ya están arriba le dice a Google cuál es la página buena para esa búsqueda.",
      queryMeta: `Puesto ${Math.round(rec.position)}${rec.page ? ` · ${pageName(rec.page)}` : ""}`,
      steps: [
        ...(from.length > 0
          ? from.map((p) => `Abre ${pageName(p)} y añade un enlace a ${where} con el texto «${rec.query}».`)
          : [
              `Responde a «${rec.query}» en las primeras líneas de ${where}.`,
              `Enlaza ${where} desde tus páginas más visitadas, con ese texto en el enlace.`
            ]),
        `Revisa que el título de ${where} contenga la búsqueda.`
      ],
      after: "Se quita sola cuando Google te suba a la página 1."
    };
  }

  return {
    kind: "Título y descripción",
    title: rec.page
      ? `Mejora el título de ${where}: la ven ${times(rec.impressions)} y entra el ${fmtPct(rec.ctr)}`
      : `Mejora el título de la página que sale para «${rec.query}»`,
    step: `Reescribe el título y la descripción de ${rec.page ? where : "esa página"} para que digan qué ofreces y por qué entrar.`,
    scope,
    metric: fmtPct(rec.ctr),
    metricLabel: "Entran en Google",
    seen: `Sales en el puesto ${Math.round(rec.position)} para «${rec.query}» y entra el ${fmtPct(rec.ctr)} de quienes te ven. Tus otras búsquedas ${peersText(rec.position)} entran alrededor del ${fmtPct(rec.benchmark)}.`,
    why: "Google ya te enseña. Lo que decide si entran es el título y la descripción del resultado: si responden a la búsqueda, entra más gente sin cambiar de puesto.",
    queryMeta: `Puesto ${Math.round(rec.position)} · entra el ${fmtPct(rec.ctr)}${rec.page ? ` · ${where}` : ""}`,
    steps: [
      `Abre ${rec.page ? where : "esa página"} en tu gestor de contenidos.`,
      `Escribe un título que empiece por lo que busca la gente («${rec.query}») y diga qué ofreces.`,
      "Escribe una descripción de una o dos frases con el motivo para entrar."
    ],
    after: "Se quita sola cuando entren tanto como en tus otras búsquedas de ese puesto."
  };
}

export type LaterCopy = { kind: string; title: string; text: string };

/** The short card of the «Con tus datos de Google» row in «Más adelante». */
export function laterCopy(rec: GoogleRecommendation): LaterCopy {
  if (rec.kind === "watch_in_ai") {
    return {
      kind: "Vigilar en la IA",
      title: `«${rec.query}»`,
      text: "Ya te buscan así en Google. Añádela a tus prompts para ver si la IA te nombra."
    };
  }
  if (rec.kind === "improve_snippet") {
    return {
      kind: "Título y descripción",
      title: `«${rec.query}»: puesto ${Math.round(rec.position)} y pocos clics`,
      text: `Entra el ${fmtPct(rec.ctr)} de quienes te ven; tus otras búsquedas ${peersText(rec.position)}, alrededor del ${fmtPct(rec.benchmark)}. Reescribe el título y la descripción de ${rec.page ? pageName(rec.page) : "esa página"}.`
    };
  }
  const where = rec.page ? pageName(rec.page) : "la página que sale";
  return {
    kind: "Subir a la página 1",
    title: `«${rec.query}»: puesto ${Math.round(rec.position)}`,
    text: `Te ven ${times(rec.impressions)} en 28 días, en la segunda página. ${
      rec.linkFrom.length > 0
        ? `Enlaza ${where} desde ${joinPaths(rec.linkFrom)}, con ese texto en el enlace.`
        : `Responde a la búsqueda en las primeras líneas de ${where}.`
    }`
  };
}
