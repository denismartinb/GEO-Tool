import "server-only";

import { describeFailedRunReason, evaluateRecurringFreshness } from "@/lib/scan/watchdog";

/**
 * ADMIN-HEALTH-1 (`docs/brand/design-decisions-log.md` §230). The "Error"
 * column in `/admin`: is any of this account's domains NOT getting the data
 * it should? The founder asked for it after alberdiderma.es failed six days
 * in a row with nothing anywhere saying so (§227) — the alerts email now
 * covers the moment it happens; this covers "what is broken right now",
 * looked up on demand.
 *
 * It asks the same questions the scan watchdog asks, with the same scope
 * rules (§229), so the column and the emails never disagree about what counts
 * as a problem: a failed run someone expected, a run that stopped advancing,
 * or a recurring project without a completed scan in its last cycle. Silent
 * on accounts that have no reason to receive data (Free/expired trial, runs
 * the system should never have launched).
 */

export type HealthRun = {
  status: string;
  created_at: string;
  updated_at: string | null;
  error_summary: string | null;
  triggered_by_user_id: string | null;
};

export type HealthProject = {
  domain: string;
  /** `recurring_scans_enabled`; `false` when the automation columns could not be read. */
  recurringEnabled: boolean;
  /**
   * This project's runs, newest first. May be a recent window rather than the
   * whole history (the list view reads 30 days), which is why a missing
   * completed run reads "none recent", never "never".
   */
  runs: readonly HealthRun[];
};

export type AccountHealth = {
  hasError: boolean;
  /** One plain-language line per problem, naming the domain. Empty when healthy. */
  reasons: string[];
};

/** A failed run older than this is history, not a current problem. */
export const HEALTH_FAILED_RUN_WINDOW_DAYS = 7;

/** A pending/running run whose last progress is older than this has stopped advancing. */
export const HEALTH_STALLED_AFTER_MINUTES = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "Europe/Madrid" });
}

export function deriveAccountHealth(input: {
  /** Effective plan (`resolveSystemPlanId`), never the raw column. */
  planId: string;
  /**
   * SCAN-CADENCE-1 (log §271): the sweep's cadence key (`resolveCadencePlanId`)
   * — differs from `planId` only for an active Pro trial, which is daily while
   * paid Pro is every 2 days. Defaults to `planId`.
   */
  cadencePlanId?: string;
  projects: readonly HealthProject[];
  now: number;
}): AccountHealth {
  const reasons: string[] = [];
  const hasScanningPlan = input.planId !== "free";

  for (const project of input.projects) {
    const latest = project.runs[0];

    if (latest && (latest.status === "pending" || latest.status === "running")) {
      const lastProgress = Date.parse(latest.updated_at ?? latest.created_at);
      if (input.now - lastProgress > HEALTH_STALLED_AFTER_MINUTES * 60 * 1000) {
        reasons.push(`${project.domain}: escaneo parado desde ${shortDate(latest.updated_at ?? latest.created_at)}`);
      }
      // A run in flight answers the freshness question itself.
      continue;
    }

    if (
      latest &&
      latest.status === "failed" &&
      input.now - Date.parse(latest.created_at) <= HEALTH_FAILED_RUN_WINDOW_DAYS * DAY_MS &&
      (latest.triggered_by_user_id || hasScanningPlan)
    ) {
      reasons.push(
        `${project.domain}: último escaneo fallido (${shortDate(latest.created_at)}) — ${describeFailedRunReason(latest.error_summary)}`
      );
      continue;
    }

    if (project.recurringEnabled && hasScanningPlan) {
      const lastCompleted = project.runs.find((run) => run.status === "completed")?.created_at ?? null;
      const { stale } = evaluateRecurringFreshness({ planId: input.cadencePlanId ?? input.planId, lastCompletedAt: lastCompleted, now: input.now });
      if (stale) {
        reasons.push(
          lastCompleted
            ? `${project.domain}: sin datos nuevos desde ${shortDate(lastCompleted)} con el escaneo automático activo`
            : `${project.domain}: ningún escaneo completado reciente con el escaneo automático activo`
        );
      }
    }
  }

  return { hasError: reasons.length > 0, reasons };
}
