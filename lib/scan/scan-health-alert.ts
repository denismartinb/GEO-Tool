import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { isOpsAlertConfigured, sendScanHealthAlertEmail } from "@/lib/email/transactional";
import {
  EXTRACTION_VERSION,
  SCAN_HEALTH_ALERT_DEDUPE_HOURS,
  SCAN_HEALTH_ALERT_LOG_MESSAGE
} from "@/lib/scan/constants";

/**
 * EXTRACTION-RELIABILITY-1 Fase B (docs/adr/0029).
 *
 * Fase A made a failed extraction leave a categorized trace instead of a
 * silent gap. This is the half that makes anyone find out about it: without
 * it, the trace only exists in the database and the only detector is a manual
 * SQL query — which is exactly why OpenAI's extraction returning HTTP 429 on
 * every call from 2026-08-01 went unnoticed for four days while every scan
 * still reported "Completado", and why Claude's identical failure in June
 * went unnoticed too.
 *
 * The alert is deliberately narrow. It fires on what the operator can
 * actually act on, and stays quiet about what they cannot.
 */

/** Why an alert fired. Also the dedupe key's second half, alongside the engine. */
export type ScanHealthReason =
  /** A provider returned 429 — out of credit, or rate limited. Only the operator can fix it. */
  | "quota"
  /** A provider rejected the key or the model id. Same class as the pinned-model 404 of ADR 0002. */
  | "config"
  /** An engine answered prompts but not one of its rows produced extracted data. */
  | "engine_down"
  /** The run itself ended `failed` with its bounded auto-retries already spent. */
  | "run_failed";

export type ScanHealthFinding = {
  engine: string;
  reason: ScanHealthReason;
  affectedRows: number;
  totalRows: number;
};

type HealthRow = {
  provider: string | null;
  status: string;
  raw_response_text: string | null;
  extraction_version: string;
  extraction_error: string | null;
};

const REASON_COPY: Record<ScanHealthReason, { headline: string; detail: string }> = {
  quota: {
    headline: "Un motor se ha quedado sin cuota",
    detail:
      "El proveedor devuelve 429 y la extracción no puede completarse. Los reintentos con backoff ya se han agotado. Revisa el saldo o los límites de esa cuenta: no se arregla solo, y hasta que lo hagas cada escaneo perderá la parte de datos de ese motor."
  },
  config: {
    headline: "Un motor está mal configurado",
    detail:
      "El proveedor rechaza la petición por clave o modelo inválidos. No se reintenta a propósito, porque reintentarlo daría el mismo resultado. Revisa las variables de entorno de ese motor."
  },
  engine_down: {
    headline: "Un motor no ha aportado ningún dato",
    detail:
      "Ese motor respondió a los prompts, pero ninguna de sus filas llegó a convertirse en datos extraídos. El escaneo se da por completado con el resto de motores, así que sin este aviso no habría constancia de la pérdida."
  },
  run_failed: {
    headline: "Un escaneo ha fallado sin reintentos disponibles",
    detail:
      "El escaneo terminó en estado fallido y ya ha consumido su reintento automático, así que no volverá a intentarlo por su cuenta."
  }
};

/**
 * Turns a run's rows into the list of things worth waking the operator for.
 * Pure and exported so the decision — not just the plumbing — is testable.
 *
 * The thresholds encode the founder's decision (Task Intake Fase B,
 * 2026-08-04): alert on what is actionable, stay quiet about what is not.
 *
 * - `quota` and `config` alert on a single row, with no threshold. They never
 *   heal on their own and only the operator can clear them.
 * - `engine_down` needs the engine to have produced *nothing*. A partially
 *   extracted engine is degraded, not down, and the missing rows are already
 *   on record.
 * - `schema`, `invalid_json`, `empty` and `timeout` deliberately do NOT
 *   alert on their own. They are model noise: they self-correct on the next
 *   scan and there is no action to take. They still count toward
 *   `engine_down` when they take out a whole engine, which is the point at
 *   which they stop being noise.
 */
export function analyzeRunHealth(rows: readonly HealthRow[]): ScanHealthFinding[] {
  const byEngine = new Map<string, HealthRow[]>();
  for (const row of rows) {
    const engine = row.provider ?? "gemini";
    const bucket = byEngine.get(engine);
    if (bucket) bucket.push(row);
    else byEngine.set(engine, [row]);
  }

  const findings: ScanHealthFinding[] = [];

  for (const [engine, engineRows] of byEngine) {
    const answered = engineRows.filter((row) => row.status === "completed" && row.raw_response_text);
    if (answered.length === 0) continue;

    const countByCategory = (category: string) =>
      answered.filter((row) => row.extraction_error?.startsWith(`${category}:`)).length;

    for (const reason of ["quota", "config"] as const) {
      const affected = countByCategory(reason);
      if (affected > 0) findings.push({ engine, reason, affectedRows: affected, totalRows: answered.length });
    }

    const extracted = answered.filter((row) => row.extraction_version === EXTRACTION_VERSION).length;
    if (extracted === 0) {
      findings.push({ engine, reason: "engine_down", affectedRows: answered.length, totalRows: answered.length });
    }
  }

  return findings;
}

/**
 * True when an alert for this (engine, reason) already went out inside the
 * dedupe window — across **every** project, not just this one.
 *
 * Cross-project is the whole point. The daily cron sweeps every project, so a
 * single exhausted API account is one incident that would otherwise generate
 * one email per project per day. An alert that arrives twenty times is an
 * alert the operator learns to ignore, which is worse than no alert at all.
 *
 * `job_logs` is used as the dedupe store rather than `notifications` because
 * this is an operator alert: writing it to `notifications` would surface it
 * in the customer's own in-app feed. It also needs no migration. The cost is
 * that the lookup is an unindexed scan over a time-bounded slice of
 * `job_logs` — fine at private-beta volumes, and worth revisiting if that
 * table grows large.
 */
async function alreadyAlerted(input: {
  service: ReturnType<typeof createServiceClient>;
  engine: string;
  reason: ScanHealthReason;
}): Promise<boolean> {
  const since = new Date(Date.now() - SCAN_HEALTH_ALERT_DEDUPE_HOURS * 60 * 60 * 1000).toISOString();

  const { data, error } = await input.service
    .from("job_logs")
    .select("id")
    .eq("message", SCAN_HEALTH_ALERT_LOG_MESSAGE)
    .eq("context_json->>engine", input.engine)
    .eq("context_json->>reason", input.reason)
    .gte("created_at", since)
    .limit(1);

  // Fail OPEN on a lookup error: a missed alert is the failure mode this
  // whole phase exists to remove, while a duplicate one is merely annoying.
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

/**
 * Evaluates a finished run and alerts the operator about anything actionable.
 *
 * Fail-soft by construction, same rule as `checkAndSendScoreDropAlert` and
 * recommendation generation in `executePendingScan`: an alert must never be
 * the reason a scan that otherwise worked gets reported as failed. Every
 * failure path here logs and returns.
 */
export async function checkAndSendScanHealthAlert(input: {
  service: ReturnType<typeof createServiceClient>;
  projectId: string;
  runId: string;
  /** Omit when the caller doesn't already hold it — it is looked up only if an alert actually fires. */
  projectDomain?: string;
  /** Set when the run itself ended `failed` with no auto-retry left. */
  runFailedWithoutRetry?: boolean;
  finalizeJobId?: string | null;
}): Promise<void> {
  try {
    const { data: rows, error } = await input.service
      .from("scan_prompt_results")
      .select("provider, status, raw_response_text, extraction_version, extraction_error")
      .eq("project_id", input.projectId)
      .eq("run_id", input.runId);

    if (error) {
      console.error("[geo:scan:health] could not read run rows", {
        projectId: input.projectId,
        runId: input.runId,
        message: error.message
      });
      return;
    }

    const findings = analyzeRunHealth((rows ?? []) as HealthRow[]);

    if (input.runFailedWithoutRetry) {
      const totalRows = rows?.length ?? 0;
      findings.push({ engine: "—", reason: "run_failed", affectedRows: totalRows, totalRows });
    }

    if (findings.length === 0) return;

    // An unconfigured alert channel silently swallowing an alert is the exact
    // failure class this phase exists to remove — `sendScanHealthAlertEmail`
    // returns without doing anything when OPS_ALERT_EMAIL is unset, which
    // would make a real incident vanish just as thoroughly as the
    // uncategorized errors of Fase A did. Found the hard way: the var was not
    // configured at all when this shipped, so the pre-existing web-audit alert
    // (AUDIT-AFTER-SCAN-1) had been inert since the day it was written.
    // The alert still cannot be delivered, but it is no longer invisible.
    if (!isOpsAlertConfigured()) {
      console.error("[geo:scan:health] scan health findings with no OPS_ALERT_EMAIL configured — alert not delivered", {
        projectId: input.projectId,
        runId: input.runId,
        findings: findings.map((f) => `${f.engine}:${f.reason}`)
      });
      return;
    }

    // Resolved lazily: the common case is a healthy run with nothing to send,
    // and `reconcileStuckScanRuns` (one of the two callers) does not carry the
    // domain, so making every caller fetch it would add a query per run to
    // serve the rare one that alerts.
    let domain = input.projectDomain;
    if (!domain) {
      const { data: projectRow } = await input.service
        .from("projects")
        .select("domain")
        .eq("id", input.projectId)
        .maybeSingle();
      domain = (projectRow?.domain as string | undefined) ?? input.projectId;
    }

    for (const finding of findings) {
      if (await alreadyAlerted({ service: input.service, engine: finding.engine, reason: finding.reason })) continue;

      const copy = REASON_COPY[finding.reason];
      await sendScanHealthAlertEmail({
        engine: finding.engine,
        reason: finding.reason,
        headline: copy.headline,
        detail: copy.detail,
        domain,
        projectId: input.projectId,
        runId: input.runId,
        affectedRows: finding.affectedRows,
        totalRows: finding.totalRows,
        detectedAt: new Date()
      });

      // Written only AFTER the send, so a failed send does not silence the
      // next run's attempt. A duplicate email beats a swallowed incident.
      if (input.finalizeJobId) {
        await input.service.from("job_logs").insert({
          job_id: input.finalizeJobId,
          project_id: input.projectId,
          run_id: input.runId,
          level: "warn",
          message: SCAN_HEALTH_ALERT_LOG_MESSAGE,
          context_json: { engine: finding.engine, reason: finding.reason, affected_rows: finding.affectedRows }
        });
      }
    }
  } catch (alertError) {
    console.error("[geo:scan:health] alert check failed", {
      projectId: input.projectId,
      runId: input.runId,
      message: alertError instanceof Error ? alertError.message : String(alertError)
    });
  }
}
