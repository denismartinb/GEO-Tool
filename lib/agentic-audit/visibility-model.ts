import type { AgenticCheckResult, AgenticComponentId, AgenticComponentResult } from "@/lib/agentic-audit/api-contract";
import { componentLine, componentStatus, firstSteps, type FirstStep, type Tone } from "@/lib/agentic-audit/console-model";
import type { PurchaseQuestionsReport } from "@/lib/agentic-audit/purchase-questions";
import { scoreIfChecksPass } from "@/lib/agentic-audit/score";
import { formatShare } from "@/lib/report/report-model";

/**
 * «Visibilidad en agentes» (AGENTIC-COMMERCE-1 Fase 2d, log §332), laid out as
 * the approved prototype (docs/design-reference/agentic-commerce-1/
 * prototipo.html): summary, the path an agent takes, the five components,
 * «Preguntas de compra» and «Qué hacer primero». The first path step comes
 * from the purchase questions, everything else from the stored agentic
 * review. Pure, so Vitest covers every line the screen prints.
 */

export type PathTone = Tone | "neutral";
export type PathStep = { id: string; title: string; tone: PathTone; line: string };

const STEPS: Array<{ id: AgenticComponentId; title: string }> = [
  { id: "discovery", title: "Entra" },
  { id: "understanding", title: "Entiende" },
  { id: "trust", title: "Se fía" },
  { id: "purchase", title: "Compra" }
];

/** The first step: the share, with no colour, because nothing says what share is good (log §332). */
export function findLine(purchase: PurchaseQuestionsReport | null): string {
  if (!purchase) return "Aparecerá tras tu primer escaneo";
  if (purchase.figures) return `Te nombran en el ${formatShare(purchase.figures.named)} de las preguntas de compra`;
  if (purchase.questions.length === 0) return "Ninguna de tus preguntas es de compra todavía";
  return "Aún hay pocas preguntas de compra para dar un porcentaje";
}

export function agentPath(result: AgenticCheckResult | null, purchase: PurchaseQuestionsReport | null): PathStep[] {
  const find: PathStep = { id: "find", title: "Te encuentra", tone: "neutral", line: findLine(purchase) };
  return [
    find,
    ...STEPS.map(({ id, title }) => {
      const component = result?.components.find((c) => c.id === id);
      if (!result || !component) return { id, title, tone: "na" as const, line: "Pendiente de la auditoría agéntica" };
      return { id, title, tone: componentStatus(component, result).tone, line: componentLine(result, component) };
    })
  ];
}

/** «6 de tus 17 prompts». Inside the customer's own console, never in public copy. */
export function purchaseCountLine(purchase: PurchaseQuestionsReport): string {
  const n = purchase.questions.length;
  return `${n} de tus ${purchase.totalQuestions} prompts`;
}

/** What each component card says it measures, as in the prototype. */
export const COMPONENT_PURPOSE: Record<AgenticComponentId | "interop", string> = {
  discovery: "Que te encuentren y puedan entrar.",
  understanding: "Que entiendan lo que vendes.",
  trust: "Que puedan fiarse y explicarlo.",
  purchase: "Que lleguen a comprar o reservar.",
  interop: "Canal directo para agentes."
};

/** The component's share of the total: 14 of 30. `null` when it could not be measured. */
export function componentPoints(component: AgenticComponentResult): number | null {
  if (component.score === null) return null;
  return Math.round((component.score * component.weight) / 100);
}

/** The interoperability card's last line: what is missing, never «sin puntos» (log §317). */
export function interopLine(result: AgenticCheckResult): { tone: Tone; line: string } {
  const absent = result.interop.items.filter((i) => i.state === "absent").map((i) => i.label);
  if (absent.length > 0) return { tone: "warn", line: `Te falta: ${joinList(absent)}` };
  if (result.interop.items.some((i) => i.state === "unknown")) return { tone: "na", line: "No se pudo comprobar todo desde fuera" };
  return { tone: "ok", line: "Publicas los cuatro" };
}

const HOLDS_BACK: Record<AgenticComponentId, string> = {
  discovery: "Lo que más frena a un agente es entrar en tu web.",
  understanding: "Lo que más frena a un agente es entender lo que vendes.",
  trust: "Lo que más frena a un agente es fiarse de tu web.",
  purchase: "Lo que más frena a un agente es llegar a comprar."
};

/**
 * The summary's headline: the weakest measured component, worded as what holds
 * an agent back. Template over the stored review, never a promise.
 */
export function visibilityHeadline(result: AgenticCheckResult | null): string {
  if (!result) return "La auditoría agéntica revisa tu web sola tras cada escaneo.";
  if (result.found === "none") return "No hemos encontrado qué vendes en tu web.";
  const measured = result.components.filter((c) => c.score !== null);
  if (measured.length === 0) return "Tu web no dejó leer la página a nuestro robot.";
  const weakest = measured.reduce((a, b) => ((b.score as number) < (a.score as number) ? b : a));
  if (componentStatus(weakest, result).tone === "ok" && measured.length === result.components.length) {
    return "Un agente puede recorrer tu web hasta comprar.";
  }
  return HOLDS_BACK[weakest.id];
}

/** The line under the headline: the first thing that is not right in the weakest component. */
export function visibilityDetail(result: AgenticCheckResult | null): string | null {
  if (!result || result.found === "none") return null;
  const measured = result.components.filter((c) => c.score !== null);
  if (measured.length === 0) return null;
  const weakest = measured.reduce((a, b) => ((b.score as number) < (a.score as number) ? b : a));
  const line = componentLine(result, weakest);
  return line ? `${weakest.name}: ${line}.` : null;
}

const COUNT_WORD = ["", "lo primero", "las dos primeras cosas", "las tres primeras cosas"];

/**
 * «Si arreglas lo primero de «Qué hacer primero», subes de 54 a 77», with the
 * target recomputed by the engine (`scoreIfChecksPass`), never summed.
 */
export function fixbarLine(
  result: AgenticCheckResult,
  steps: FirstStep[]
): { what: string; from: number; to: number } | null {
  if (result.score === null || steps.length === 0) return null;
  const to = scoreIfChecksPass(result, new Set(steps.map((s) => s.checkId)));
  if (to === null || to <= result.score) return null;
  return { what: COUNT_WORD[steps.length] ?? "lo primero", from: result.score, to };
}

/** The tone of the check behind a first step, for its dot. */
export function stepTone(result: AgenticCheckResult, step: FirstStep): Tone {
  const state = result.components.find((c) => c.id === step.component)?.checks.find((k) => k.id === step.checkId)?.state;
  return state === "fail" ? "bad" : state === "avg" ? "warn" : "na";
}

const TIME_ZONE = "Europe/Madrid";

/** «Revisado · hoy», «Revisado · ayer», «Revisado · 12 oct». */
export function reviewedPill(iso: string, now: Date): string {
  const at = new Date(iso);
  const day = (d: Date) => d.toLocaleDateString("es-ES", { timeZone: TIME_ZONE });
  if (day(at) === day(now)) return "Revisado · hoy";
  if (day(at) === day(new Date(now.getTime() - 24 * 60 * 60 * 1000))) return "Revisado · ayer";
  return `Revisado · ${at.toLocaleDateString("es-ES", { timeZone: TIME_ZONE, day: "numeric", month: "short" }).replace(".", "")}`;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/**
 * The card on Visión general (AGENTIC-COMMERCE-1 Fase 2b, log §340): Pro,
 * Agencia and the trial see it only when the latest review found something
 * the site sells and could score it; Starter sees an invitation to Pro
 * (founder, 2026-10-18). Any other plan, nothing. No points per fix.
 */
export type OverviewAgenticCard =
  | { kind: "hidden" }
  | { kind: "upsell" }
  | {
      kind: "card";
      score: number;
      headline: string;
      components: Array<{ id: AgenticComponentId; name: string; points: number | null; weight: number; percent: number }>;
      first: { title: string; tone: Tone } | null;
    };

export function overviewAgenticCard(planId: string | null | undefined, result: AgenticCheckResult | null): OverviewAgenticCard {
  if (planId === "starter") return { kind: "upsell" };
  if (planId !== "pro" && planId !== "agency") return { kind: "hidden" };
  if (!result || result.found === "none" || result.score === null) return { kind: "hidden" };
  const components = STEPS.flatMap(({ id }) => {
    const component = result.components.find((c) => c.id === id);
    if (!component) return [];
    return [{ id, name: component.name, points: componentPoints(component), weight: component.weight, percent: component.score ?? 0 }];
  });
  const [step] = firstSteps(result, 1);
  return {
    kind: "card",
    score: result.score,
    headline: visibilityHeadline(result),
    components,
    first: step ? { title: step.title, tone: stepTone(result, step) } : null
  };
}
