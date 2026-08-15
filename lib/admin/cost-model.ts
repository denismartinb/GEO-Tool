import "server-only";
import { formatUsd, provenanceLabel, type CostProvenance } from "@/lib/admin/cost-format";

export { formatUsd, provenanceLabel };
export type { CostProvenance };

/**
 * ADMIN-CONSOLE-2a. Coste estimado por proyecto para la consola de operador.
 *
 * Cada tarifa de aquí sale de `docs/llm-cost-analysis-2026-08.md` §7 (tabla
 * consolidada, cierre 2026-08-10) y **viaja con su procedencia**, porque no
 * todas valen lo mismo: la generación está medida sobre datos de producción,
 * la extracción es una estimación de tarifas públicas por tamaño, y la
 * cobertura de auditoría no está medida en absoluto. Una pantalla que las
 * mezclara en un solo número sin decirlo estaría inventando precisión — que es
 * exactamente lo que CLAUDE.md prohíbe ("no fake metrics").
 *
 * Si esas tarifas cambian en el análisis, cambian aquí: este fichero no es una
 * segunda fuente de verdad, es una copia declarada de la primera.
 */

export type EngineId = "gemini" | "claude" | "openai";

/** $/llamada de generación, MEDIDO (docs/llm-cost-analysis-2026-08.md §7). */
const GENERATION_USD_PER_CALL: Record<EngineId, number> = {
  gemini: 0.002,
  claude: 0.0022,
  openai: 0.0117
};

/** $/llamada de extracción, ESTIMADO — el producto no registra tokens aquí (§7, §3). */
const EXTRACTION_USD_PER_CALL: Record<EngineId, number> = {
  gemini: 0.0014,
  claude: 0.0027,
  openai: 0.00036
};

/**
 * $/auditoría de la mitad de COBERTURA, NO MEDIDO (§7, peor caso con ~8
 * prompts). La mitad TÉCNICA es $0 por diseño — no llama a ningún LLM —, así
 * que no aparece como constante: sumar cero sugeriría que se ha medido algo.
 */
const COVERAGE_AUDIT_USD = 0.28;

/**
 * Cadencia real del barrido recurrente, copiada de
 * `RECURRING_INTERVAL_MS_BY_PLAN` en `lib/scan/cron.ts`. Free aparece con
 * cadencia diaria ahí, pero el propio barrido lo descarta antes
 * (`skipped_plan_ineligible`), así que su coste recurrente real es 0 — eso lo
 * decide `estimateProjectMonthlyCost` abajo, no esta tabla.
 */
const SCANS_PER_MONTH_BY_PLAN: Record<string, number> = {
  free: 30,
  starter: 4.3,
  pro: 30,
  agency: 30
};

export type ProjectCostInput = {
  planId: string;
  /** Prompts activos del proyecto. Cada uno se lanza contra cada motor activo. */
  promptCount: number;
  /** Motores realmente activos en el proyecto (ENGINE-DEBUG-TOGGLE-1, migración 0033). */
  engines: EngineId[];
  recurringScansEnabled: boolean;
  coverageAuditEnabled: boolean;
};

export type ProjectCostEstimate = {
  /** Coste de un escaneo completo del proyecto, en USD. */
  perScanUsd: number;
  /** Coste mensual estimado sumando escaneos recurrentes y auditorías de cobertura. */
  monthlyUsd: number;
  /**
   * Lo peor que hay dentro del número: si alguna parte es estimada o no
   * medida, el conjunto no puede presentarse como medido.
   */
  provenance: CostProvenance;
  /** Explicación en una línea de cómo se compuso, para enseñarla junto a la cifra. */
  basis: string;
};

/**
 * El coste recurrente de un proyecto Free es 0 aunque tenga el interruptor
 * puesto: `runRecurringScanSweep` descarta los proyectos de plan Free antes de
 * escanearlos. Mostrar un coste ahí sería cobrar en la pantalla por trabajo que
 * el backend nunca hace.
 */
export function recurringScansAreEffective(planId: string, recurringScansEnabled: boolean): boolean {
  return recurringScansEnabled && planId !== "free";
}

export function estimateProjectMonthlyCost(input: ProjectCostInput): ProjectCostEstimate {
  const engines = input.engines.length > 0 ? input.engines : [];

  const perScanUsd = engines.reduce(
    (sum, engine) => sum + (GENERATION_USD_PER_CALL[engine] + EXTRACTION_USD_PER_CALL[engine]) * input.promptCount,
    0
  );

  const scansPerMonth = recurringScansAreEffective(input.planId, input.recurringScansEnabled)
    ? SCANS_PER_MONTH_BY_PLAN[input.planId] ?? 30
    : 0;

  // La auditoría automática se dispara tras cada escaneo (AUDIT-AFTER-SCAN-1),
  // así que su frecuencia es la misma que la del escaneo recurrente.
  const coverageAuditsPerMonth = input.coverageAuditEnabled ? scansPerMonth : 0;

  const monthlyUsd = perScanUsd * scansPerMonth + COVERAGE_AUDIT_USD * coverageAuditsPerMonth;

  const provenance: CostProvenance = input.coverageAuditEnabled ? "no_medido" : "estimado";

  const basisParts = [
    `${input.promptCount} prompt${input.promptCount === 1 ? "" : "s"} × ${engines.length} motor${engines.length === 1 ? "" : "es"}`,
    scansPerMonth > 0 ? `${Math.round(scansPerMonth)} escaneos/mes` : "sin escaneo recurrente efectivo"
  ];
  if (input.coverageAuditEnabled) basisParts.push("incluye cobertura IA (no medida)");

  return { perScanUsd, monthlyUsd, provenance, basis: basisParts.join(" · ") };
}
