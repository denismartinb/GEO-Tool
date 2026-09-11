/**
 * ACTIONS-OBSERVABLE-1 slice 4b.1 (docs/external-audit-2026-08.md, Fase 4,
 * P0-04) — el constructor del markdown de "Exportar plan", extraído del
 * closure de `handleExport` en `recommendations-client.tsx` para que se
 * pueda probar sin navegador. Misma disciplina que
 * `lib/ui/action-feedback.ts` frente a su hook, y `lib/onboarding/
 * tour-steps.ts` frente al suyo.
 *
 * Pura: no toca `Date.now()` salvo por el parámetro `now`, no lee el DOM, no
 * crea el Blob ni el enlace de descarga — eso sigue viviendo en el
 * componente, que es quien decide si la descarga funcionó o hay que caer al
 * modal de respaldo.
 */

import { MIN_VISIBLE_POINTS, formatPoints } from "@/lib/recommendations/plan";
import { pointsCaption } from "@/lib/recommendations/deliverable";
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

function writeRecommendation(lines: string[], rec: ExportPlanRecommendation, index: number): void {
  const pts =
    typeof rec.potentialPoints === "number" && rec.potentialPoints >= MIN_VISIBLE_POINTS
      ? ` (+${formatPoints(rec.potentialPoints)} pt ${pointsCaption(rec.recommendation_type)})`
      : "";
  lines.push(`${index + 1}. **${rec.title}**${pts}`);
  lines.push(`   ${rec.description}`);
  const step = rec.evidence_json?.first_step;
  if (step) lines.push(`   Empieza por aquí: ${step}`);
  lines.push("");
}

/**
 * Genera el markdown completo del plan de acción. `now` es inyectable
 * únicamente para que el test no dependa del reloj real — mismo motivo que
 * `isPromoActive()` se mockea en vez de leer la fecha real (log §197).
 */
export function buildExportPlanMarkdown(params: {
  domain: string;
  plan: ExportPlanRecommendation[];
  rest: ExportPlanRecommendation[];
  now?: Date;
}): string {
  const { domain, plan, rest, now = new Date() } = params;
  const lines: string[] = [
    `# Plan de acción GEO — ${domain}`,
    "",
    `Generado por GenScore · ${now.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" })}`,
    "",
    `## Prioritarias (${plan.length})`,
    "",
  ];
  plan.forEach((rec, i) => writeRecommendation(lines, rec, i));
  if (rest.length > 0) {
    lines.push(`## Resto (${rest.length})`, "");
    rest.forEach((rec, i) => writeRecommendation(lines, rec, i));
  }
  return lines.join("\n");
}

export function exportPlanFileName(domain: string): string {
  return `plan-geo-${domain || "genscore"}.md`;
}
