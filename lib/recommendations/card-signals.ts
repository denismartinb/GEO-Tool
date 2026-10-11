/**
 * RECS-SHORT-CARD-1 (log §301): the two confidences a recommendation card
 * shows, kept apart on purpose.
 *
 * - "Lo que vimos" is about the DATA: how much evidence backs the finding. It
 *   reads `confidence`, which the engine copies from the run score (sample
 *   size and coverage of that scan), plus what the evidence itself says:
 *   how many distinct questions, which engines, how many scans in a row.
 * - "Por qué funciona" is about the ADVICE: whether the move is in the
 *   user's hands. It reads the deliverable's control (own site, GenScore or
 *   a third party) and the query shape. Never the run score: a large sample
 *   does not make a third party more likely to add you.
 *
 * Pure and client-safe (the card imports it).
 */
import { getEngineMeta } from "@/lib/scan/engine-meta";
import type { DeliverableControl } from "@/lib/recommendations/deliverable";

export type DataSignal = {
  label: string;
  tone: "strong" | "medium" | "weak";
  /** What was observed, or null when the evidence carries nothing to say. */
  note: string | null;
};

export type AdviceSignal = {
  label: string;
  note: string;
};

/** "Gemini", "Gemini y ChatGPT", "Gemini, Claude y ChatGPT". */
export function enginesList(providers: readonly string[]): string {
  const names = Array.from(new Set(providers.map((p) => getEngineMeta(p).label)));
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

function questionsText(n: number): string {
  return n === 1 ? "1 pregunta" : `${n} preguntas`;
}

/**
 * The collapsed card's scope line: "2 preguntas · Gemini y ChatGPT". Null when
 * the evidence names neither questions nor engines (campaign-level types),
 * so the card shows nothing rather than an empty line.
 */
export function scopeLine(questionCount: number, providers: readonly string[]): string | null {
  const parts: string[] = [];
  if (questionCount > 0) parts.push(questionsText(questionCount));
  const engines = enginesList(providers);
  if (engines) parts.push(engines);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function dataSignal(input: {
  /** "low" | "medium" | "high"; anything else reads as medium, as the old label did. */
  confidence: string;
  questionCount: number;
  providers: readonly string[];
  runsOpen: number;
}): DataSignal {
  const { confidence, questionCount, providers, runsOpen } = input;
  const tone: DataSignal["tone"] = confidence === "high" ? "strong" : confidence === "low" ? "weak" : "medium";
  const label = tone === "strong" ? "Dato sólido" : tone === "weak" ? "Dato escaso" : "Dato medio";

  const seen: string[] = [];
  if (questionCount > 0) seen.push(`en ${questionsText(questionCount)}`);
  const engines = enginesList(providers);
  if (engines) seen.push(`de ${engines}`);
  const parts: string[] = [];
  if (seen.length > 0) parts.push(`Visto ${seen.join(" ")}`);
  if (runsOpen > 1) parts.push(`sigue abierta tras ${runsOpen} escaneos seguidos`);
  if (confidence === "low") parts.push("tu último escaneo tuvo pocas respuestas, tómalo como una pista");

  const note = parts.length > 0 ? `${parts.join(" · ")}.` : null;
  return { label, tone, note: note ? note.charAt(0).toUpperCase() + note.slice(1) : null };
}

export function adviceSignal(control: DeliverableControl | null, queryShape?: string): AdviceSignal | null {
  if (queryShape === "definition") {
    return {
      label: "Con límite",
      note: "En una pregunta de definición lo realista es que te citen, no que te nombren."
    };
  }
  if (control === "own_site") {
    return { label: "Lo controlas tú", note: "Es un cambio en tu web y no depende de nadie más." };
  }
  if (control === "in_app") {
    return { label: "Lo haces aquí", note: "Se hace desde GenScore, sin tocar tu web." };
  }
  if (control === "third_party") {
    return { label: "Depende de terceros", note: "El resultado depende de que otra web te incluya." };
  }
  return null;
}
