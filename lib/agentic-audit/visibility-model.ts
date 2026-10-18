import type { AgenticCheckResult, AgenticComponentId } from "@/lib/agentic-audit/api-contract";
import { componentLine, componentStatus, type Tone } from "@/lib/agentic-audit/console-model";
import type { PurchaseQuestionsReport } from "@/lib/agentic-audit/purchase-questions";
import { formatShare } from "@/lib/report/report-model";

/**
 * «Visibilidad en agentes» (AGENTIC-COMMERCE-1 Fase 2d, log §330): the path
 * an agent takes through the site. The first step comes from the purchase
 * questions, the other four from the stored agentic review. Pure, so Vitest
 * covers every line the screen prints.
 */

export type PathTone = Tone | "neutral";
export type PathStep = { id: string; title: string; tone: PathTone; line: string };

const STEPS: Array<{ id: AgenticComponentId; title: string }> = [
  { id: "discovery", title: "Entra" },
  { id: "understanding", title: "Entiende" },
  { id: "trust", title: "Se fía" },
  { id: "purchase", title: "Compra" }
];

/** The first step: the share, with no colour, because nothing says what share is good (log §330). */
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

/** «6 de tus 17 preguntas». Inside the customer's own console, never in public copy. */
export function purchaseCountLine(purchase: PurchaseQuestionsReport): string {
  const n = purchase.questions.length;
  return `${n} de tus ${purchase.totalQuestions} preguntas`;
}
