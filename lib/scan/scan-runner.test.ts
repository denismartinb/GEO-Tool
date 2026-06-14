import { describe, expect, it } from "vitest";
import {
  ALL_RECOVERABLE_ERROR_SUMMARIES,
  getActionErrorCode,
  getDisplayErrorSummary,
  getRunErrorDisplay,
  getSanitizedScanError,
  PROMPT_RETRY_MAX_TOTAL_ATTEMPTS,
  ProjectActionError,
  RECOVERABLE_ERROR_SUMMARIES,
  SCAN_NO_RESULTS_ERROR_SUMMARY,
  SCAN_NO_RESULTS_RETRY_EXHAUSTED_ERROR_SUMMARY,
  SCAN_PENDING_TIMEOUT_ERROR_SUMMARY,
  SCAN_PENDING_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY,
  SCAN_TIMEOUT_ERROR_SUMMARY,
  SCAN_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY
} from "./scan-runner";

describe("getActionErrorCode", () => {
  it("returns the code for a ProjectActionError", () => {
    expect(getActionErrorCode(new ProjectActionError("project_not_found"))).toBe("project_not_found");
    expect(getActionErrorCode(new ProjectActionError("too_many_prompts"))).toBe("too_many_prompts");
  });

  it("returns unexpected_error for an arbitrary Error", () => {
    expect(getActionErrorCode(new Error("raw postgres failure with secrets"))).toBe("unexpected_error");
  });

  it("returns unexpected_error for a non-Error value", () => {
    expect(getActionErrorCode("just a string")).toBe("unexpected_error");
    expect(getActionErrorCode(null)).toBe("unexpected_error");
    expect(getActionErrorCode(undefined)).toBe("unexpected_error");
  });
});

describe("getSanitizedScanError", () => {
  it("returns a specific message for project_not_found", () => {
    expect(getSanitizedScanError(new ProjectActionError("project_not_found"))).toBe(
      "No se ha encontrado el proyecto o el escaneo solicitado."
    );
  });

  it("returns a specific message for project_archived", () => {
    expect(getSanitizedScanError(new ProjectActionError("project_archived"))).toBe(
      "El proyecto está archivado y no puede ejecutarse."
    );
  });

  it("returns a specific message for too_many_prompts", () => {
    expect(getSanitizedScanError(new ProjectActionError("too_many_prompts"))).toBe(
      "El escaneo pendiente supera el límite de prompts permitido."
    );
  });

  it("returns a generic message for other ProjectActionError codes", () => {
    const generic = "No se pudo completar la ejecución del escaneo.";
    expect(getSanitizedScanError(new ProjectActionError("scan_failed"))).toBe(generic);
    expect(getSanitizedScanError(new ProjectActionError("active_run_exists"))).toBe(generic);
    expect(getSanitizedScanError(new ProjectActionError("unexpected_error"))).toBe(generic);
  });

  it("never leaks the raw message of a plain Error", () => {
    const generic = "No se pudo completar la ejecución del escaneo.";
    const rawError = new Error("raw postgres failure with secrets and connection strings");

    const sanitized = getSanitizedScanError(rawError);

    expect(sanitized).toBe(generic);
    expect(sanitized).not.toContain("postgres");
    expect(sanitized).not.toContain("secrets");
  });

  it("returns the generic message for non-Error, non-ProjectActionError values", () => {
    const generic = "No se pudo completar la ejecución del escaneo.";
    expect(getSanitizedScanError("some string")).toBe(generic);
    expect(getSanitizedScanError(null)).toBe(generic);
    expect(getSanitizedScanError(undefined)).toBe(generic);
  });

  it("returns a distinct message for scan_failed_no_results (SCAN-ROBUST-1)", () => {
    const noResults = getSanitizedScanError(new ProjectActionError("scan_failed_no_results"));
    const generic = "No se pudo completar la ejecución del escaneo.";

    expect(noResults).toBe(SCAN_NO_RESULTS_ERROR_SUMMARY);
    // Must be distinguishable from the generic config-error message so
    // reconcileStuckScanRuns can tell "zero successful prompts" (recoverable)
    // apart from a GeminiConfigError (terminal, never retried).
    expect(noResults).not.toBe(generic);
  });
});

describe("getDisplayErrorSummary", () => {
  it("returns null for null, undefined, and empty string", () => {
    expect(getDisplayErrorSummary(null)).toBeNull();
    expect(getDisplayErrorSummary(undefined)).toBeNull();
    expect(getDisplayErrorSummary("")).toBeNull();
  });

  it("returns the retrying message for non-exhausted timeout summaries", () => {
    const retryingMessage = "Reintentando tu escaneo automáticamente…";
    expect(getDisplayErrorSummary(SCAN_TIMEOUT_ERROR_SUMMARY)).toBe(retryingMessage);
    expect(getDisplayErrorSummary(SCAN_PENDING_TIMEOUT_ERROR_SUMMARY)).toBe(retryingMessage);
  });

  it("returns the could-not-complete message for retry-exhausted timeout summaries", () => {
    const exhaustedMessage = "No hemos podido completar este escaneo. Puedes lanzar uno nuevo.";
    expect(getDisplayErrorSummary(SCAN_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY)).toBe(exhaustedMessage);
    expect(getDisplayErrorSummary(SCAN_PENDING_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY)).toBe(exhaustedMessage);
  });

  it("passes through an arbitrary, already-sanitized error_summary unchanged", () => {
    const sanitized = "No se pudo completar la ejecución del escaneo.";
    expect(getDisplayErrorSummary(sanitized)).toBe(sanitized);
  });

  it("returns the retrying message for SCAN_NO_RESULTS_ERROR_SUMMARY (auto-retry just triggered)", () => {
    expect(getDisplayErrorSummary(SCAN_NO_RESULTS_ERROR_SUMMARY)).toBe(
      "Reintentando tu escaneo automáticamente…"
    );
  });

  it("returns the could-not-complete message for SCAN_NO_RESULTS_RETRY_EXHAUSTED_ERROR_SUMMARY", () => {
    expect(getDisplayErrorSummary(SCAN_NO_RESULTS_RETRY_EXHAUSTED_ERROR_SUMMARY)).toBe(
      "No hemos podido completar este escaneo. Puedes lanzar uno nuevo."
    );
  });
});

describe("getRunErrorDisplay", () => {
  it("returns null when there is no error_summary", () => {
    expect(getRunErrorDisplay(null)).toBeNull();
    expect(getRunErrorDisplay(undefined)).toBeNull();
    expect(getRunErrorDisplay("")).toBeNull();
  });

  it("returns kind 'notice' for a non-exhausted timeout, with matching message", () => {
    const display = getRunErrorDisplay(SCAN_TIMEOUT_ERROR_SUMMARY);
    expect(display).not.toBeNull();
    expect(display?.kind).toBe("notice");
    expect(display?.message).toBe(getDisplayErrorSummary(SCAN_TIMEOUT_ERROR_SUMMARY));

    const pendingDisplay = getRunErrorDisplay(SCAN_PENDING_TIMEOUT_ERROR_SUMMARY);
    expect(pendingDisplay?.kind).toBe("notice");
    expect(pendingDisplay?.message).toBe(getDisplayErrorSummary(SCAN_PENDING_TIMEOUT_ERROR_SUMMARY));
  });

  it("returns kind 'error' for a retry-exhausted timeout, with matching message", () => {
    const display = getRunErrorDisplay(SCAN_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY);
    expect(display).not.toBeNull();
    expect(display?.kind).toBe("error");
    expect(display?.message).toBe(getDisplayErrorSummary(SCAN_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY));

    const pendingDisplay = getRunErrorDisplay(SCAN_PENDING_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY);
    expect(pendingDisplay?.kind).toBe("error");
    expect(pendingDisplay?.message).toBe(getDisplayErrorSummary(SCAN_PENDING_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY));
  });

  it("returns kind 'error' for any other (non-timeout) error_summary, with matching message", () => {
    const arbitrary = "No se pudo completar la ejecución del escaneo.";
    const display = getRunErrorDisplay(arbitrary);

    expect(display).not.toBeNull();
    expect(display?.kind).toBe("error");
    expect(display?.message).toBe(getDisplayErrorSummary(arbitrary));
    expect(display?.message).toBe(arbitrary);
  });

  it("returns kind 'notice' for SCAN_NO_RESULTS_ERROR_SUMMARY (auto-retry just triggered)", () => {
    const display = getRunErrorDisplay(SCAN_NO_RESULTS_ERROR_SUMMARY);

    expect(display).not.toBeNull();
    expect(display?.kind).toBe("notice");
    expect(display?.message).toBe("Reintentando tu escaneo automáticamente…");
  });

  it("returns kind 'error' for SCAN_NO_RESULTS_RETRY_EXHAUSTED_ERROR_SUMMARY", () => {
    const display = getRunErrorDisplay(SCAN_NO_RESULTS_RETRY_EXHAUSTED_ERROR_SUMMARY);

    expect(display).not.toBeNull();
    expect(display?.kind).toBe("error");
    expect(display?.message).toBe("No hemos podido completar este escaneo. Puedes lanzar uno nuevo.");
  });
});

describe("SCAN-ROBUST-1 constants", () => {
  it("PROMPT_RETRY_MAX_TOTAL_ATTEMPTS allows exactly one retry", () => {
    expect(PROMPT_RETRY_MAX_TOTAL_ATTEMPTS).toBe(2);
  });

  it("RECOVERABLE_ERROR_SUMMARIES includes both timeout summaries and the zero-results summary", () => {
    expect(RECOVERABLE_ERROR_SUMMARIES.has(SCAN_TIMEOUT_ERROR_SUMMARY)).toBe(true);
    expect(RECOVERABLE_ERROR_SUMMARIES.has(SCAN_PENDING_TIMEOUT_ERROR_SUMMARY)).toBe(true);
    expect(RECOVERABLE_ERROR_SUMMARIES.has(SCAN_NO_RESULTS_ERROR_SUMMARY)).toBe(true);

    // Exhausted variants are terminal, not "currently recoverable".
    expect(RECOVERABLE_ERROR_SUMMARIES.has(SCAN_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY)).toBe(false);
    expect(RECOVERABLE_ERROR_SUMMARIES.has(SCAN_NO_RESULTS_RETRY_EXHAUSTED_ERROR_SUMMARY)).toBe(false);
  });

  it("ALL_RECOVERABLE_ERROR_SUMMARIES is the union of recoverable and exhausted summaries", () => {
    for (const summary of RECOVERABLE_ERROR_SUMMARIES) {
      expect(ALL_RECOVERABLE_ERROR_SUMMARIES.has(summary)).toBe(true);
    }
    expect(ALL_RECOVERABLE_ERROR_SUMMARIES.has(SCAN_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY)).toBe(true);
    expect(ALL_RECOVERABLE_ERROR_SUMMARIES.has(SCAN_PENDING_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY)).toBe(true);
    expect(ALL_RECOVERABLE_ERROR_SUMMARIES.has(SCAN_NO_RESULTS_RETRY_EXHAUSTED_ERROR_SUMMARY)).toBe(true);
  });
});
