import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { isOpsAlertConfigured, sendSweepHealthAlertEmail } from "@/lib/email/transactional";
import type { CronResult } from "@/lib/scan/cron";

/**
 * RECURRING-CADENCE-1 Fase B (`docs/brand/design-decisions-log.md` §193).
 *
 * `checkAndSendScanHealthAlert` alerta sobre lo que pasa DENTRO de un run
 * terminado — un motor sin cuota, una extracción que no produjo nada, un run
 * caducado sin reintentos. Nada alertaba un piso por encima: un escaneo del
 * cron que revienta antes de existir como run, o un proyecto que el propio
 * barrido decidió no escanear. El resumen del barrido se registraba con
 * `console.info` y ahí moría (ADR 0029 Fase B: "un fallo que el operador puede
 * arreglar tiene que llegar al operador" — escrito para el run, no aplicado al
 * barrido).
 */
export type SweepAlertReason =
  /** El intento de escaneo lanzó: el run no llegó a existir, o su ejecución reventó. */
  | "scan_failed"
  /** Tres runs fallidos seguidos: el proyecto está FUERA del recurrente hasta que alguien lo escanee a mano. */
  | "failure_streak"
  /** La pasada dejó proyectos aplazados sin haber escaneado ninguno, así que la cadena no continúa. */
  | "sweep_no_progress";

export type SweepFinding = { projectId: string; reason: SweepAlertReason };

const REASON_COPY: Record<SweepAlertReason, { headline: string; detail: string }> = {
  scan_failed: {
    headline: "El escaneo automático falló",
    detail:
      "El barrido intentó escanear este dominio y la llamada lanzó una excepción, así que hoy no tiene datos nuevos. Mira los logs del cron para la causa concreta; si se repite tres veces seguidas, el dominio sale del recurrente."
  },
  failure_streak: {
    headline: "Fuera del escaneo recurrente por racha de fallos",
    detail:
      "Sus tres últimos escaneos fallaron, así que el barrido ha dejado de intentarlo. No se recupera solo: hay que lanzarle un escaneo a mano y que termine bien para que vuelva a la cadencia automática."
  },
  sweep_no_progress: {
    headline: "El barrido no escaneó nada y quedaron proyectos pendientes",
    detail:
      "Ningún proyecto de esta pasada llegó a escanearse, así que la cadena de continuación no siguió (guardián de progreso) y los aplazados esperan al disparo de mañana. Suele significar que algo común a todos está fallando."
  }
};

/**
 * Traduce el resumen de una pasada a la lista de cosas por las que merece la
 * pena despertar al operador. Pura y exportada: la decisión —no el fontanero—
 * es lo que hay que poder probar.
 *
 * Silencios deliberados, por la misma razón que los de `analyzeRunHealth`:
 * `skipped_recent` y `skipped_plan_ineligible` son el funcionamiento normal,
 * y `skipped_active_run` es un escaneo que ya está corriendo. Alertar de eso
 * sería un correo diario que se aprende a ignorar, que es peor que ninguno.
 *
 * `sweep_no_progress` exige `deferred > 0`: una pasada que escanea 0 porque
 * todos sus candidatos estaban al día es exactamente lo que debe pasar la
 * mayoría de los días. Lo que no es normal es quedarse trabajo sin hacer Y no
 * haber avanzado nada, que es cuando el guardián de progreso corta la cadena.
 */
export function collectSweepFindings(input: {
  results: readonly CronResult[];
  scanned: number;
  deferred: number;
}): SweepFinding[] {
  const findings: SweepFinding[] = [];

  for (const result of input.results) {
    if (result.status === "failed") findings.push({ projectId: result.projectId, reason: "scan_failed" });
    else if (result.status === "skipped_failure_streak")
      findings.push({ projectId: result.projectId, reason: "failure_streak" });
  }

  if (input.scanned === 0 && input.deferred > 0) {
    const [firstDeferred] = input.results.filter((result) => result.status === "skipped_budget");
    findings.push({ projectId: firstDeferred?.projectId ?? "—", reason: "sweep_no_progress" });
  }

  return findings;
}

/**
 * Manda el resumen de la pasada si hay algo que contar.
 *
 * Fail-soft por construcción, igual que `checkAndSendScanHealthAlert`: una
 * alerta no puede ser jamás el motivo de que un barrido que por lo demás
 * funcionó acabe en error. Todo camino de fallo registra y vuelve.
 */
export async function checkAndSendSweepAlert(input: {
  service: ReturnType<typeof createServiceClient>;
  results: readonly CronResult[];
  scanned: number;
  deferred: number;
  chainIndex: number;
}): Promise<void> {
  try {
    const findings = collectSweepFindings(input);
    if (findings.length === 0) return;

    // Mismo razonamiento que en `checkAndSendScanHealthAlert`: un canal sin
    // configurar que se traga la alerta es la clase de fallo que esta fase
    // existe para quitar, no una excusa para callarse. Se registra con los
    // hallazgos dentro, para que el log sirva de algo aunque el correo no
    // salga (OPS_ALERT_EMAIL llevaba meses sin poner cuando se descubrió, y
    // la alerta de auditoría estaba inerte desde el día que se escribió).
    if (!isOpsAlertConfigured()) {
      console.error(
        "[geo:scan:cron] sweep findings but the alert channel is not deliverable (needs OPS_ALERT_EMAIL and RESEND_API_KEY) — alert not delivered",
        { chainIndex: input.chainIndex, findings: findings.map((f) => `${f.projectId}:${f.reason}`) }
      );
      return;
    }

    const projectIds = Array.from(
      new Set(findings.map((finding) => finding.projectId).filter((id) => id !== "—"))
    );
    const domainByProjectId = new Map<string, string>();

    if (projectIds.length) {
      const { data: projectRows } = await input.service.from("projects").select("id, domain").in("id", projectIds);
      for (const row of projectRows ?? []) domainByProjectId.set(row.id as string, row.domain as string);
    }

    await sendSweepHealthAlertEmail({
      chainIndex: input.chainIndex,
      detectedAt: new Date(),
      findings: findings.map((finding) => ({
        projectId: finding.projectId,
        domain: domainByProjectId.get(finding.projectId) ?? finding.projectId,
        ...REASON_COPY[finding.reason]
      }))
    });
  } catch (alertError) {
    console.error("[geo:scan:cron] sweep alert failed", {
      chainIndex: input.chainIndex,
      message: alertError instanceof Error ? alertError.message : String(alertError)
    });
  }
}
