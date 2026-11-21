/**
 * First-scan mission copy and counter (CONSOLE-INSTRUMENTO-1 F3b, log §355).
 * Pure. The five phases are the real beats of `computeMissionBeat`; the
 * counter is always a count of rows that exist, and the unit says which.
 */
import type { MissionBeat } from "@/lib/scan/mission-beats";
import type { ActiveScanRun } from "@/components/scan-in-progress";

export const MISSION_PHASES = ["En la rampa", "Ignición", "Ascenso", "En órbita", "Cerrando la misión"] as const;

export function phaseIndex(beat: MissionBeat): number {
  switch (beat.key) {
    case "rampa":
      return 0;
    case "ignicion":
      return 1;
    case "ascenso":
      return 2;
    case "orbita":
      return 3;
    case "entrega":
      return 4;
  }
}

export function joinEngineNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

const ENGINE_COUNT_WORDS: Record<number, string> = { 2: "Los dos", 3: "Los tres", 4: "Los cuatro" };

/** The line under the counter, per phase. Ignition counts the run's real engines. */
export function missionLine(beat: MissionBeat, engineCount: number | null): string {
  switch (beat.key) {
    case "rampa":
      return "Tú no tienes que hacer nada.";
    case "ignicion": {
      if (engineCount === 1) return "Preguntando tus prompts.";
      const words = engineCount !== null ? ENGINE_COUNT_WORDS[engineCount] : undefined;
      return `${words ?? "Todos"} a la vez. Sí, se puede.`;
    }
    case "ascenso":
      return "Puedes cerrar esta pestaña. Esto no se cae.";
    case "orbita":
      return "Leemos menciones, puestos y citas.";
    case "entrega":
      return "Calculando tu Puntuación GEO.";
  }
}

export function missionHeadline(beat: MissionBeat): string {
  switch (beat.key) {
    case "rampa":
      return "Preparando tu primer escaneo";
    case "ignicion":
      return "Motores encendidos";
    case "ascenso":
      return "Preguntando a cada motor";
    case "orbita":
      return "Leyendo las respuestas";
    case "entrega":
      return "Casi está";
  }
}

export type MissionCounter = { got: number; total: number | null; unit: string };

/**
 * `engineCounts`: answers received per provider (`readEngineResponseCounts`),
 * absent when the poll could not count. While the engines answer the counter is
 * answers received out of launches x engines; once they are done it is answers
 * read out of the answers the run holds. Never a clock, never an estimate.
 */
export function missionCounter(
  beat: MissionBeat,
  run: ActiveScanRun,
  engineCounts: Record<string, number> | null,
  engines: number | null
): MissionCounter {
  if (beat.key === "orbita" || beat.key === "entrega") {
    const total = run.responses_total ?? null;
    const got = run.responses_processed ?? 0;
    return { got: beat.key === "entrega" && total !== null ? total : got, total, unit: "respuestas leídas" };
  }
  const launches = run.total_prompts ?? null;
  if (engineCounts && engines !== null && launches !== null && launches > 0) {
    const got = Object.values(engineCounts).reduce((a, b) => a + b, 0);
    return { got, total: launches * engines, unit: "respuestas recibidas" };
  }
  const done = (run.successful_prompts ?? 0) + (run.failed_prompts ?? 0);
  return { got: done, total: launches, unit: launches === 1 ? "lanzamiento" : "lanzamientos" };
}
