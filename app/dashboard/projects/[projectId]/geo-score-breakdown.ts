/**
 * Pure presentation logic for the GEO Score component breakdown
 * (GEO-SCORE-V4, ADR 0033 §7 — the component breakdown is a stated
 * obligation, not polish: "wherever the GeoScore is shown, its component
 * breakdown must be visible", so that "subió porque arreglaste la web" and
 * "subió porque las IAs te citan más" stay distinguishable).
 *
 * Extracted out of `page.tsx` purely so it is unit-testable without
 * rendering the page.
 */

import type { EngineCoverage } from "@/lib/scan/engine-coverage";

export type GeoScoreComponentKey = "presence" | "prominence" | "standing" | "authority" | "technical";

/** GEO-SCORE-V4 (ADR 0033 §5) — persisted verdict on whether every engine the plan promised actually produced rows this run. */
export type GeoScoreEngineCoverage = {
  status?: "complete" | "partial" | "unknown";
  expected?: string[];
  observed?: string[];
  missing?: string[];
  unexpected?: string[];
};

export const GEO_SCORE_COMPONENT_META: Record<GeoScoreComponentKey, { label: string; hint: string }> = {
  presence: { label: "Presencia", hint: "Menciones de tu marca en las respuestas de IA." },
  prominence: { label: "Prominencia", hint: "Puesto medio de tu marca cuando la IA la menciona." },
  standing: { label: "Cuota de voz", hint: "Tus menciones frente a las de tus competidores." },
  authority: { label: "Autoridad", hint: "Citas de la IA a páginas de tu propio dominio." },
  technical: { label: "Preparación técnica", hint: "Salud técnica de tu web para motores de IA — determinista, sin IA de por medio." }
};

/**
 * Translates a dropped component's persisted `reason` (a self-authored,
 * internal-English, ADR-referencing string — lib/scoring/run-scoring.ts /
 * lib/scoring/geo-score-technical.ts) into the honest, user-facing Spanish
 * copy CLAUDE.md requires, without inventing detail the reason doesn't
 * carry. Matched by content rather than trusting a fixed set of literal
 * strings, so a future wording tweak on the scoring side degrades to the
 * generic fallback instead of leaking English — the same tradeoff already
 * accepted by `feedbackErrorMessages` (lib/projects/feedback-messages.ts)
 * for redirect error codes.
 */
export function translateDroppedComponentReason(reason: string | undefined | null): string {
  const r = reason ?? "";
  if (r.includes("extraction predates")) {
    return "Este escaneo usa una versión de extracción anterior a la verificación de menciones — no es fiable para este cálculo.";
  }
  if (r.includes("rank-when-mentioned needs at least")) {
    const match = r.match(/mentioned in (\d+) prompts/);
    const count = match ? match[1] : null;
    return count
      ? `Tu marca solo apareció en ${count} ${count === "1" ? "respuesta" : "respuestas"} de IA — hacen falta más para calcular un puesto fiable.`
      : "Tu marca apareció en muy pocas respuestas de IA para calcular un puesto fiable.";
  }
  if (r.includes("brand_position absent") || r.includes("brand was never mentioned")) {
    return "Tu marca no apareció en ninguna respuesta de este escaneo.";
  }
  if (r.includes("no competitors tracked")) {
    return "No tienes competidores configurados con los que comparar tu cuota de voz.";
  }
  if (r.includes("share-of-voice denominator is 0")) {
    return "Ni tu marca ni tus competidores aparecieron en las respuestas de este escaneo.";
  }
  if (r.includes("no grounded")) {
    return "Ningún motor con capacidad de citar fuentes participó en este escaneo, o no hay un dominio con el que comparar.";
  }
  if (r.includes("has been recorded for this project yet")) {
    return "Tu web todavía no tiene ninguna auditoría técnica.";
  }
  if (r.includes("produced no readiness score")) {
    return "La auditoría técnica no pudo analizar ninguna página de tu web.";
  }
  if (r.includes("no finish time")) {
    return "Este escaneo no tiene una fecha de fin con la que emparejar una auditoría técnica.";
  }
  if (r.includes("no technical audit within")) {
    return "No hay ninguna auditoría técnica reciente para este escaneo (últimos 30 días).";
  }
  if (r.includes("no technical readiness audit available")) {
    return "Todavía no hay una auditoría técnica disponible para este proyecto.";
  }
  return "No disponible para este escaneo.";
}

/**
 * Defensive reshape of the persisted (all-optional, JSON-round-tripped)
 * `engine_coverage` into the shape `engineCoverageNotice`
 * (lib/scan/engine-coverage.ts) expects, rather than an unchecked cast —
 * `details_json` is untyped JSONB, so a row written before ADR 0033 (or a
 * malformed one) must degrade to null, not throw.
 */
export function parseEngineCoverage(raw: GeoScoreEngineCoverage | null | undefined): EngineCoverage | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    expected: raw.expected ?? [],
    observed: raw.observed ?? [],
    missing: raw.missing ?? [],
    unexpected: raw.unexpected ?? []
  };
}
