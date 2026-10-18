import {
  agenticBand,
  type AgenticCheckResult,
  type AgenticOfferKind,
  type AgenticComponentId,
  type AgenticComponentResult
} from "@/lib/agentic-audit/api-contract";
import { scoreIfChecksPass } from "@/lib/agentic-audit/score";

/**
 * AGENTIC-COMMERCE-1 Fase 2a (log §322): what the console screen says about
 * one stored review. Pure, so it runs in the client and in Vitest. Every word
 * comes from the engine's result; nothing here invents a number.
 */

export type Tone = "ok" | "warn" | "bad" | "na";

export const FIRST_STEPS_MAX = 3;

const BAND_WORD = { pass: "Bien", avg: "Mejorable", fail: "Falla" } as const;
const BAND_TONE = { pass: "ok", avg: "warn", fail: "bad" } as const;

export function componentStatus(
  component: AgenticComponentResult,
  result?: Pick<AgenticCheckResult, "pageRead">
): { tone: Tone; word: string } {
  if (component.score === null) {
    // Without a page that sells something (log §323, §325), these two wait for one; they did not fail.
    const needsProduct = result?.pageRead === true && (component.id === "understanding" || component.id === "purchase");
    return { tone: "na", word: needsProduct ? "Al vender" : "Sin medir" };
  }
  const band = agenticBand(component.score);
  return { tone: BAND_TONE[band], word: BAND_WORD[band] };
}

/** Why a component has no reading: the page was not read, or it is not a product page. */
export function unmeasuredReason(result: AgenticCheckResult, id: AgenticComponentId): string {
  if (!result.pageRead) return "Tu protección anti-bots no dejó leer la página a nuestro robot";
  if (id === "understanding" || id === "purchase") return "Se mide en una página donde vendas algo";
  return "No se pudo medir";
}

/** One short line under each component: the first thing that is not right, or the first check when all pass. */
export function componentLine(result: AgenticCheckResult, component: AgenticComponentResult): string {
  if (component.score === null) return unmeasuredReason(result, component.id);
  const measured = component.checks.filter((c) => c.state !== "unknown");
  const weakest = measured.find((c) => c.state === "fail") ?? measured.find((c) => c.state === "avg");
  return (weakest ?? measured[0])?.label ?? "";
}

export type FirstStep = { key: string; checkId: string; title: string; seen: string; component: AgenticComponentId };

/** The fixes that raise the total most, each with what we saw on the page. */
export function firstSteps(result: AgenticCheckResult, max = FIRST_STEPS_MAX): FirstStep[] {
  const steps: FirstStep[] = [];
  for (const fix of result.fixes) {
    if (steps.length >= max) break;
    const check = result.components.find((c) => c.id === fix.component)?.checks.find((k) => k.id === fix.checkId);
    if (!check) continue;
    steps.push({ key: `${fix.component}-${fix.checkId}`, checkId: fix.checkId, title: fix.label, seen: check.label, component: fix.component });
  }
  return steps;
}

const COUNT_WORD = ["", "lo primero", "las dos primeras cosas", "las tres primeras cosas"];

/**
 * «Si arreglas …, subes a N», with N recomputed by the engine
 * (`scoreIfChecksPass`). `null` when there is no total or nothing would move it.
 */
export function projectedSentence(result: AgenticCheckResult, steps: FirstStep[]): string | null {
  if (result.score === null || steps.length === 0) return null;
  const ids = new Set(steps.map((s) => s.checkId));
  const projected = scoreIfChecksPass(result, ids);
  if (projected === null || projected <= result.score) return null;
  const what = COUNT_WORD[steps.length] ?? "lo primero";
  return `Si arreglas ${what} de «Qué hacer primero», subes a ${projected}.`;
}

const FOUND_SOURCE = { catalog: "tu catálogo", sitemap: "tu sitemap", home: "tu portada" } as const;

/** Where the reviewed page came from (log §323). `null` for reviews stored before it was recorded. */
export function foundSentence(result: Pick<AgenticCheckResult, "found">): string | null {
  switch (result.found) {
    case "catalog":
    case "sitemap":
    case "home":
      return `Elegida automáticamente de ${FOUND_SOURCE[result.found]}.`;
    case "given":
      return "La página que elegiste.";
    default:
      return null;
  }
}

/** Which component opens first: the first one with something to fix, else Descubrimiento. */
export function initialComponent(result: AgenticCheckResult): AgenticComponentId {
  const withIssue = result.components.find((c) => c.checks.some((k) => k.state === "fail" || k.state === "avg"));
  return withIssue?.id ?? "discovery";
}

const KIND_LABEL: Record<AgenticOfferKind, string> = {
  physical: "Producto físico",
  software: "Software",
  service: "Servicio",
  course: "Curso o formación",
  booking: "Reserva o cita",
  event: "Entradas y eventos",
  subscription: "Suscripción",
  offer: "Página de venta"
};

/** Log §325: the chip next to the reviewed page, «Software · página de precios». `null` when the page sells nothing. */
export function offerLabel(result: Pick<AgenticCheckResult, "pageKind" | "offerKind" | "pricingPage">): string | null {
  if (result.pageKind !== "product") return null;
  // Reviews stored before §325 only ever chose physical products.
  const label = KIND_LABEL[result.offerKind ?? "physical"];
  return result.pricingPage ? `${label} · página de precios` : label;
}

const NOT_APPLICABLE: Partial<Record<AgenticOfferKind, string>> = {
  software: "Stock, identificadores y envío no aplican a un software, así que no cuentan.",
  service: "Stock, identificadores y envío no aplican a un servicio, así que no cuentan.",
  course: "Stock, identificadores y envío no aplican a un curso, así que no cuentan.",
  booking: "Stock, identificadores y envío no aplican a una reserva, así que no cuentan.",
  event: "Identificadores y envío no aplican a unas entradas, así que no cuentan.",
  subscription: "Stock, identificadores y envío no aplican a una suscripción, así que no cuentan.",
  offer: "Stock, identificadores y envío sólo se piden a un producto físico, así que no cuentan."
};

/** Log §325: which checks were left out for what this page sells. `null` for a physical product. */
export function notApplicableNote(result: Pick<AgenticCheckResult, "pageKind" | "offerKind">): string | null {
  if (result.pageKind !== "product" || !result.offerKind) return null;
  return NOT_APPLICABLE[result.offerKind] ?? null;
}
