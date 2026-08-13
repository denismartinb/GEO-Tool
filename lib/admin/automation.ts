import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import {
  estimateProjectMonthlyCost,
  recurringScansAreEffective,
  type CostProvenance,
  type EngineId,
  type ProjectCostEstimate
} from "@/lib/admin/cost-model";

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * ADMIN-CONSOLE-2a — estado de los automatismos (escaneo recurrente y
 * auditoría automática) y su coste estimado, por proyecto y agregado por
 * cuenta.
 *
 * **Vive en su propio módulo y en sus propias consultas, a propósito.** Las
 * migraciones de este repo se aplican a mano en el editor SQL de Supabase
 * (`supabase/migrations/migrations.test.ts`), así que entre que se mergea
 * código y alguien pega el SQL hay una ventana en la que una columna NO existe
 * — y una columna que PostgREST no conoce hace fallar el `select` ENTERO, no
 * sólo ese campo. Si estas lecturas viajaran dentro de la consulta principal de
 * `/admin/users`, una migración pendiente dejaría la pantalla entera en blanco
 * en vez de dejar una columna sin dato. Es el mismo razonamiento (y el mismo
 * remedio) que ya aplica `/debug` con las mitades de auditoría, y que
 * `.claude/rules/scan.md` exige en la ruta crítica de creación de escaneos.
 *
 * Dirección de fallo: hacia **desconocido**, nunca hacia un valor inventado.
 * Esta pantalla es de sólo lectura y su único trabajo es informar; enseñar
 * "desactivado" cuando en realidad no se pudo leer sería peor que enseñar
 * "sin dato", porque parece una respuesta.
 */

export type AutomationAvailability = "ok" | "unmigrated";

export type ProjectAutomation = {
  projectId: string;
  recurringScansEnabled: boolean;
  /**
   * Las DOS mitades de auditoría (migración 0031), no el `auto_web_audit_enabled`
   * de la 0030: esa columna está **retirada**. Sigue en la tabla porque
   * borrarla es un cambio destructivo con su propia aprobación, pero ya no la
   * lee ningún camino y su default sigue siendo `true`, así que leerla habría
   * pintado "auditoría activada, con coste" en casi todas las cuentas cuando la
   * realidad es que está apagada en casi todas. Lo cazó la QA de este PR antes
   * de mergear (log §65).
   *
   * Sólo la mitad de COBERTURA cuesta dinero ($0,28/auditoría, sin medir); la
   * técnica es $0 por diseño.
   */
  technicalAuditEnabled: boolean;
  coverageAuditEnabled: boolean;
  /**
   * `true` sólo si el escaneo recurrente además SURTE EFECTO. El barrido
   * descarta los proyectos de plan Free (`skipped_plan_ineligible` en
   * `lib/scan/cron.ts`), así que un Free con el interruptor puesto no se
   * escanea nunca — y la pantalla tiene que decir eso, no repetir el booleano.
   */
  recurringScansEffective: boolean;
  promptCount: number;
  engines: EngineId[];
  cost: ProjectCostEstimate;
};

export type AccountAutomation = {
  /** Proyectos activos con escaneo recurrente EFECTIVO, sobre el total de activos. */
  recurringActive: number;
  /**
   * Proyectos activos con la auditoría de COBERTURA activada, sobre el total.
   * Es la mitad que gasta LLM; la técnica se cuenta aparte porque cuesta $0 y
   * mezclarlas haría que la columna de coste no se pudiera explicar.
   */
  auditActive: number;
  /** Proyectos con la mitad TÉCNICA activada (coste $0 por diseño). */
  technicalAuditActive: number;
  totalProjects: number;
  /** Proyectos con el recurrente puesto pero inerte por ser plan Free. */
  recurringInertOnFree: number;
  monthlyUsd: number;
  /**
   * Lo peor que hay dentro de `monthlyUsd`. Sin esto no había de dónde sacar la
   * etiqueta en la tabla ni en el KPI, y las cifras salían desnudas —
   * contradiciendo la propia regla que esta fase escribió. Lo cazó la QA.
   */
  provenance: CostProvenance;
  availability: AutomationAvailability;
};

export type AutomationSnapshot = {
  byOwner: Map<string, AccountAutomation>;
  byProject: Map<string, ProjectAutomation>;
  availability: AutomationAvailability;
};

const EMPTY_SNAPSHOT: AutomationSnapshot = {
  byOwner: new Map(),
  byProject: new Map(),
  availability: "unmigrated"
};

/**
 * `!== false` y no `=== true`: cuando la columna existe pero la fila es
 * antigua, PostgREST puede devolver `null` antes de que el `default` se
 * materialice. Leer hacia el comportamiento ya desplegado (motores activos)
 * es la misma dirección que eligen `run-creation.ts` y `executor.ts`.
 */
function enginesFromRow(row: Record<string, unknown> | undefined): EngineId[] {
  if (!row) return ["gemini", "claude", "openai"];
  return [
    row.engine_gemini_enabled !== false ? "gemini" : null,
    row.engine_claude_enabled !== false ? "claude" : null,
    row.engine_openai_enabled !== false ? "openai" : null
  ].filter(Boolean) as EngineId[];
}

/**
 * Devuelve el estado de automatismos de todos los proyectos activos, agregado
 * por dueño. Nunca lanza: cualquier fallo de lectura degrada a
 * `availability: "unmigrated"` y la pantalla lo dice.
 */
export async function loadAutomationSnapshot(
  service: ServiceClient,
  planIdByOwnerId: Map<string, string>,
  /**
   * Acota la lectura a un dueño. La ficha de un usuario no necesita el estado
   * de todos los proyectos de la plataforma, y sin esto cada clic en una fila
   * leía el conjunto entero — un coste que crece con el total de proyectos para
   * una pantalla que sólo enseña los de uno (señalado por la QA de este PR).
   */
  ownerUserId?: string
): Promise<AutomationSnapshot> {
  let projects: Array<Record<string, unknown>> = [];

  try {
    let query = service
      .from("projects")
      .select(
        "id, owner_user_id, recurring_scans_enabled, auto_technical_audit_enabled, auto_coverage_audit_enabled, engine_gemini_enabled, engine_claude_enabled, engine_openai_enabled"
      )
      .eq("is_archived", false);

    if (ownerUserId) query = query.eq("owner_user_id", ownerUserId);

    const { data, error } = await query;

    if (error) {
      console.error("[geo:admin] automation columns unreadable — showing 'sin dato' instead of a guess", {
        message: error.message
      });
      return EMPTY_SNAPSHOT;
    }
    projects = (data ?? []) as Array<Record<string, unknown>>;
  } catch (unexpected) {
    console.error("[geo:admin] automation query threw", {
      message: unexpected instanceof Error ? unexpected.message : String(unexpected)
    });
    return EMPTY_SNAPSHOT;
  }

  const projectIds = projects.map((project) => String(project.id));
  const promptCountByProject = await countActivePrompts(service, projectIds);

  const byProject = new Map<string, ProjectAutomation>();
  const byOwner = new Map<string, AccountAutomation>();

  for (const project of projects) {
    const projectId = String(project.id);
    const ownerId = String(project.owner_user_id);
    const planId = planIdByOwnerId.get(ownerId) ?? "pro";

    const recurringScansEnabled = project.recurring_scans_enabled === true;
    // `=== true`, no `!== false`: la 0031 declara que estas dos columnas leen
    // FALLANDO CERRADO (default `false` = "no gastes"), al revés que la 0030.
    // Es la misma comparación que hace el código vivo en `audit-job-runner.ts`.
    const technicalAuditEnabled = project.auto_technical_audit_enabled === true;
    const coverageAuditEnabled = project.auto_coverage_audit_enabled === true;
    const engines = enginesFromRow(project);
    const promptCount = promptCountByProject.get(projectId) ?? 0;
    const recurringScansEffective = recurringScansAreEffective(planId, recurringScansEnabled);

    const cost = estimateProjectMonthlyCost({
      planId,
      promptCount,
      engines,
      recurringScansEnabled,
      coverageAuditEnabled
    });

    byProject.set(projectId, {
      projectId,
      recurringScansEnabled,
      recurringScansEffective,
      technicalAuditEnabled,
      coverageAuditEnabled,
      promptCount,
      engines,
      cost
    });

    const account = byOwner.get(ownerId) ?? {
      recurringActive: 0,
      auditActive: 0,
      technicalAuditActive: 0,
      totalProjects: 0,
      recurringInertOnFree: 0,
      monthlyUsd: 0,
      provenance: "estimado" as CostProvenance,
      availability: "ok" as AutomationAvailability
    };

    account.totalProjects += 1;
    if (recurringScansEffective) account.recurringActive += 1;
    if (recurringScansEnabled && !recurringScansEffective) account.recurringInertOnFree += 1;
    if (coverageAuditEnabled) account.auditActive += 1;
    if (technicalAuditEnabled) account.technicalAuditActive += 1;
    account.monthlyUsd += cost.monthlyUsd;
    // El total no puede ser más fiable que su peor sumando.
    if (cost.provenance === "no_medido") account.provenance = "no_medido";

    byOwner.set(ownerId, account);
  }

  return { byOwner, byProject, availability: "ok" };
}

/**
 * Un `count` por proyecto en paralelo sería una consulta por dominio; a la
 * escala de esta pantalla (decenas de cuentas) una sola lectura de los ids y
 * un recuento en memoria es más barato y, sobre todo, no crece con el número
 * de proyectos en número de viajes a la base.
 */
async function countActivePrompts(service: ServiceClient, projectIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (projectIds.length === 0) return counts;

  try {
    const { data, error } = await service
      .from("project_prompts")
      .select("project_id")
      .in("project_id", projectIds)
      .eq("is_active", true);

    if (error) {
      console.error("[geo:admin] active prompt count unreadable", { message: error.message });
      return counts;
    }

    for (const row of data ?? []) {
      const projectId = String((row as { project_id: unknown }).project_id);
      counts.set(projectId, (counts.get(projectId) ?? 0) + 1);
    }
  } catch (unexpected) {
    console.error("[geo:admin] active prompt count threw", {
      message: unexpected instanceof Error ? unexpected.message : String(unexpected)
    });
  }

  return counts;
}
