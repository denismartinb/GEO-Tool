/**
 * Lo que queda de "Exportar plan" (ACTIONS-OBSERVABLE-1 slice 4b.1,
 * PDF-EXPORT-PLAN-1): `recommendationEngineLabels`, que siguen usando los
 * correos de ciclo de vida. El botón, el informe `ExportReport` y el markdown
 * de respaldo se retiraron en GEO-REPORT-1 Fase 2 (log §250): el informe de
 * GenScore (`/informe/[projectId]`) los sustituye.
 */

import { getEngineMeta } from "@/lib/scan/engine-meta";

export type ExportPlanRecommendation = {
  title: string;
  description: string;
  recommendation_type: string;
  potentialPoints?: number | null;
  evidence_json?: {
    first_step?: string | null;
    affected_prompt_details?: Array<{ provider?: string | null }> | null;
  } | null;
};

/**
 * PDF-EXPORT-PLAN-1 — qué motor respalda una recomendación, para la portada
 * del informe. Misma fuente que ya pinta `RecCard` (`evidence_json.
 * affected_prompt_details[].provider`) y el mismo `getEngineMeta` que usa
 * toda la pantalla — nunca una lista de motores propia. Ausencia de
 * `provider` en una fila (evidencia persistida antes de RECS-EVIDENCE-2) se
 * omite, nunca se asume Gemini por defecto (mismo motivo que RecCard).
 */
export function recommendationEngineLabels(rec: ExportPlanRecommendation): string[] {
  const details = rec.evidence_json?.affected_prompt_details ?? [];
  const labels = new Set<string>();
  for (const d of details) {
    if (d.provider) labels.add(getEngineMeta(d.provider).label);
  }
  return [...labels];
}
