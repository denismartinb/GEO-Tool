import {
  RETRY_EXHAUSTED_ERROR_SUMMARIES,
  SCAN_NO_RESULTS_ERROR_SUMMARY,
  TIMEOUT_ERROR_SUMMARIES
} from "@/lib/scan/constants";
import {
  ProjectActionError,
  type ProjectActionErrorCode,
  type RunErrorDisplay
} from "@/lib/scan/types";

export function getActionErrorCode(error: unknown): ProjectActionErrorCode {
  if (error instanceof ProjectActionError) return error.code;
  return "unexpected_error";
}

export function getSanitizedScanError(error: unknown) {
  if (error instanceof ProjectActionError) {
    switch (error.code) {
      case "project_not_found":
        return "No se ha encontrado el proyecto o el escaneo solicitado.";
      case "project_archived":
        return "El proyecto está archivado y no puede ejecutarse.";
      case "too_many_prompts":
        return "El escaneo pendiente supera el límite de prompts permitido.";
      case "scan_failed_no_results":
        return SCAN_NO_RESULTS_ERROR_SUMMARY;
      default:
        return "No se pudo completar la ejecución del escaneo.";
    }
  }

  return "No se pudo completar la ejecución del escaneo.";
}

/**
 * Maps a stored `scan_runs.error_summary` value to what the user actually
 * sees on the Escaneos / Overview pages.
 *
 * The raw timeout reasons (`scan_timeout`, `scan_pending_timeout`, and their
 * `_retry_exhausted` variants) are internal diagnostic strings written by
 * `reconcileStuckScanRuns` and must never be shown verbatim — per the
 * founder's review, the technical "no respondió a tiempo" wording is too
 * alarming for end users.
 *
 * - First-time timeout (auto-retry just triggered, cap not reached): return
 *   a neutral, non-alarming message — a new scan is already starting.
 * - Retry-exhausted timeout (cap reached, no further auto-retry): return a
 *   calmer "couldn't complete" message that still doesn't expose internal
 *   terms, and points the user at manual relaunch.
 * - Any other `error_summary` (non-timeout failures) is already a sanitized,
 *   user-facing string from `getSanitizedScanError` or a job-level message —
 *   returned as-is.
 * - `null`/`undefined` is returned as `null` so callers can decide whether to
 *   render an error row at all.
 */
export function getDisplayErrorSummary(errorSummary: string | null | undefined): string | null {
  if (!errorSummary) return null;

  if (RETRY_EXHAUSTED_ERROR_SUMMARIES.has(errorSummary)) {
    return "No hemos podido completar este escaneo. Puedes lanzar uno nuevo.";
  }

  if (TIMEOUT_ERROR_SUMMARIES.has(errorSummary) || errorSummary === SCAN_NO_RESULTS_ERROR_SUMMARY) {
    return "Reintentando tu escaneo automáticamente…";
  }

  return errorSummary;
}

/**
 * Like `getDisplayErrorSummary`, but also classifies the message so the UI
 * can pick a non-alarming visual treatment for a timeout that is currently
 * being auto-retried (PR #78), vs. a genuine terminal error.
 *
 * Returns `null` when there is nothing to render (no `error_summary`).
 */
export function getRunErrorDisplay(errorSummary: string | null | undefined): RunErrorDisplay | null {
  if (!errorSummary) return null;

  const isNonExhaustedTimeout = TIMEOUT_ERROR_SUMMARIES.has(errorSummary) && !RETRY_EXHAUSTED_ERROR_SUMMARIES.has(errorSummary);
  const isNoResultsRetrying = errorSummary === SCAN_NO_RESULTS_ERROR_SUMMARY;

  if (isNonExhaustedTimeout || isNoResultsRetrying) {
    return { message: getDisplayErrorSummary(errorSummary) as string, kind: "notice" };
  }

  return { message: getDisplayErrorSummary(errorSummary) as string, kind: "error" };
}
