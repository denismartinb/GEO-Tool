import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { createServiceClient } from "@/lib/supabase/service";
import {
  SCAN_NO_RESULTS_ERROR_SUMMARY,
  SCAN_NO_RESULTS_RETRY_EXHAUSTED_ERROR_SUMMARY,
  SCAN_PENDING_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY,
  SCAN_TIMEOUT_AUTO_RETRY_CAP,
  SCAN_TIMEOUT_ERROR_SUMMARY
} from "@/lib/scan/constants";
import { scanRunsNeedReconciliation } from "@/lib/scan/reconciliation";

type ServiceClient = ReturnType<typeof createServiceClient>;

type ScanRunRow = {
  id: string;
  project_id: string;
  status: "pending" | "running" | "completed" | "failed";
  error_summary: string | null;
  started_at: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
};

/**
 * Mock `createPendingScanRunCore` so `attemptAutoRetry`'s dynamic import of
 * `@/lib/scan/run-creation` resolves to a spy instead of touching real
 * Supabase. Each call appends a new `pending` row to the in-memory table so
 * the "skip if a newer run exists" logic in the zero-results pass can be
 * exercised across repeated reconciliation calls.
 */
const createPendingScanRunCore = vi.fn();
vi.mock("@/lib/scan/run-creation", () => ({
  createPendingScanRunCore: (...args: unknown[]) => createPendingScanRunCore(...args)
}));

/**
 * SCAN-DRIVE-1: the auto-retry now also *starts* the run it creates. Mocked
 * because the real one schedules an `after()` callback and self-fetches an
 * internal route — neither of which exists under Vitest.
 */
const scheduleScanContinuation = vi.fn();
vi.mock("@/lib/scan/continuation", () => ({
  scheduleScanContinuation: (...args: unknown[]) => scheduleScanContinuation(...args)
}));

/**
 * Minimal in-memory `scan_runs` table backing a fake service client. Supports
 * exactly the query shapes reconciliation.ts issues:
 *   - select(...).eq(...).eq(...).lt(...)                       -> array
 *   - select(...).eq(...).eq(...).in(...).gte(...)               -> { count }
 *   - select(...).eq(...).eq(...).eq(...).order(...)             -> array
 *   - select(...).eq(...).order(...).limit(...).maybeSingle()    -> single | null
 *   - update(...).eq(...).eq(...).eq(...)                        -> { error: null }
 */
function fakeServiceClient(initialRows: ScanRunRow[]) {
  const rows: ScanRunRow[] = initialRows.map((row) => ({ ...row }));

  function applyEq(data: ScanRunRow[], column: keyof ScanRunRow, value: unknown) {
    return data.filter((row) => row[column] === value);
  }

  function selectBuilder(initialRows: ScanRunRow[]) {
    let data = [...initialRows];
    const builder = {
      eq(column: keyof ScanRunRow, value: unknown) {
        data = applyEq(data, column, value);
        return builder;
      },
      neq(column: keyof ScanRunRow, value: unknown) {
        data = data.filter((row) => row[column] !== value);
        return builder;
      },
      lt(column: "started_at" | "created_at" | "updated_at", value: string) {
        data = data.filter((row) => {
          const fieldValue = row[column];
          return fieldValue !== null && fieldValue < value;
        });
        return Promise.resolve({ data, error: null });
      },
      gte(column: "created_at", value: string) {
        data = data.filter((row) => row[column] >= value);
        return Promise.resolve({ count: data.length, error: null });
      },
      in(column: keyof ScanRunRow, values: unknown[]) {
        data = data.filter((row) => values.includes(row[column]));
        return builder;
      },
      order(column: "created_at", opts: { ascending: boolean }) {
        data = [...data].sort((a, b) => {
          const cmp = a[column].localeCompare(b[column]);
          return opts.ascending ? cmp : -cmp;
        });
        return builder;
      },
      limit(_n: number) {
        return builder;
      },
      maybeSingle() {
        return Promise.resolve({ data: data[0] ?? null, error: null });
      },
      // Allow `await` directly on the builder for plain select chains
      // (e.g. .select(...).eq(...).eq(...).eq(...).order(...) with no
      // terminal call) by making it thenable.
      then(resolve: (value: { data: ScanRunRow[]; error: null }) => unknown) {
        return Promise.resolve({ data, error: null }).then(resolve);
      }
    };
    return builder;
  }

  function updateBuilder(patch: Partial<ScanRunRow>) {
    let filters: Array<[keyof ScanRunRow, unknown]> = [];
    const builder = {
      eq(column: keyof ScanRunRow, value: unknown) {
        filters.push([column, value]);
        // Resolve once all filters are applied — reconciliation always calls
        // .eq() exactly 3 times after .update(), so apply on the 3rd.
        if (filters.length >= 3) {
          let matches = [...rows];
          for (const [col, val] of filters) {
            matches = matches.filter((row) => row[col] === val);
          }
          for (const match of matches) {
            Object.assign(match, patch);
          }
          return Promise.resolve({ error: null });
        }
        return builder;
      }
    };
    return builder;
  }

  const service = {
    from(table: string) {
      if (table !== "scan_runs") throw new Error(`unexpected table: ${table}`);
      return {
        select: (_columns: string, _opts?: unknown) => selectBuilder(rows),
        update: (patch: Partial<ScanRunRow>) => updateBuilder(patch)
      };
    }
  };

  return { service: service as unknown as ServiceClient, rows };
}

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";

describe("reconcileStuckScanRuns — SCAN-ROBUST-1 generalized auto-retry", () => {
  beforeEach(() => {
    createPendingScanRunCore.mockReset();
    createPendingScanRunCore.mockResolvedValue("new-run-id");
    scheduleScanContinuation.mockReset();
    scheduleScanContinuation.mockResolvedValue(undefined);
    // Every test in this block seeds rows with fixed 2026-06-13 timestamps
    // and reasons about staleness/lookback windows relative to "now" (the
    // pending/running timeout cutoffs, the 24h auto-retry lookback). Pinning
    // the clock here — not just in the individual tests that already did —
    // is what keeps those comparisons meaningful regardless of the real
    // wall-clock date the suite happens to run on.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-retries a failed run with zero successful prompts (SCAN_NO_RESULTS_ERROR_SUMMARY)", async () => {
    const { service, rows } = fakeServiceClient([
      {
        id: "run-1",
        project_id: PROJECT_ID,
        status: "failed",
        error_summary: SCAN_NO_RESULTS_ERROR_SUMMARY,
        started_at: "2026-06-13T10:00:00.000Z",
        created_at: "2026-06-13T10:00:00.000Z",
        updated_at: "2026-06-13T10:01:00.000Z",
        finished_at: "2026-06-13T10:01:00.000Z"
      }
    ]);

    const { reconcileStuckScanRuns } = await import("./reconciliation");
    await reconcileStuckScanRuns({ projectId: PROJECT_ID, service });

    expect(createPendingScanRunCore).toHaveBeenCalledTimes(1);
    expect(createPendingScanRunCore).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT_ID, triggerSource: "cron", triggeredByUserId: null })
    );

    // The failed run's error_summary is left as the non-exhausted, "retrying"
    // value — getDisplayErrorSummary maps this to a calm notice.
    expect(rows[0].error_summary).toBe(SCAN_NO_RESULTS_ERROR_SUMMARY);
  });

  /**
   * Regression: the 2026-08-07 genscore.es failure (docs/adr/0037). The
   * auto-retry created run #2 and stopped there. Nothing on the server
   * executes a `pending` run, so it only advanced while the founder happened
   * to have a project screen open on his phone — and when he didn't, it aged
   * out into a second timeout, this time with the retry cap spent. A retry
   * that nobody starts is not a retry.
   */
  it("starts the run its auto-retry just created, instead of leaving it pending", async () => {
    const { service } = fakeServiceClient([
      {
        id: "run-1",
        project_id: PROJECT_ID,
        status: "failed",
        error_summary: SCAN_NO_RESULTS_ERROR_SUMMARY,
        started_at: "2026-06-13T10:00:00.000Z",
        created_at: "2026-06-13T10:00:00.000Z",
        updated_at: "2026-06-13T10:01:00.000Z",
        finished_at: "2026-06-13T10:01:00.000Z"
      }
    ]);

    const { reconcileStuckScanRuns } = await import("./reconciliation");
    await reconcileStuckScanRuns({ projectId: PROJECT_ID, service });

    expect(scheduleScanContinuation).toHaveBeenCalledTimes(1);
    expect(scheduleScanContinuation).toHaveBeenCalledWith({ projectId: PROJECT_ID, runId: "new-run-id" });
  });

  it("a failed hand-off never sinks the reconciliation itself", async () => {
    scheduleScanContinuation.mockRejectedValue(new Error("no request context"));

    const { service, rows } = fakeServiceClient([
      {
        id: "run-1",
        project_id: PROJECT_ID,
        status: "running",
        error_summary: null,
        started_at: "2026-06-13T10:00:00.000Z",
        created_at: "2026-06-13T10:00:00.000Z",
        updated_at: "2026-06-13T10:00:30.000Z",
        finished_at: null
      }
    ]);

    const { reconcileStuckScanRuns } = await import("./reconciliation");
    await reconcileStuckScanRuns({ projectId: PROJECT_ID, service });

    // The stuck run was still corrected — that is the part that unblocks
    // `active_run_exists` and must not depend on an optional hand-off.
    expect(rows[0].status).toBe("failed");
    expect(rows[0].error_summary).toBe(SCAN_TIMEOUT_ERROR_SUMMARY);
  });

  it("does not retry a zero-results run if a newer run already exists for the project", async () => {
    const { service, rows } = fakeServiceClient([
      {
        id: "run-1",
        project_id: PROJECT_ID,
        status: "failed",
        error_summary: SCAN_NO_RESULTS_ERROR_SUMMARY,
        started_at: "2026-06-13T10:00:00.000Z",
        created_at: "2026-06-13T10:00:00.000Z",
        updated_at: "2026-06-13T10:01:00.000Z",
        finished_at: "2026-06-13T10:01:00.000Z"
      },
      {
        id: "run-2",
        project_id: PROJECT_ID,
        status: "pending",
        error_summary: null,
        started_at: null,
        created_at: "2026-06-13T10:05:00.000Z",
        updated_at: "2026-06-13T10:05:00.000Z",
        finished_at: null
      }
    ]);

    const { reconcileStuckScanRuns } = await import("./reconciliation");
    await reconcileStuckScanRuns({ projectId: PROJECT_ID, service });

    expect(createPendingScanRunCore).not.toHaveBeenCalled();
    expect(rows[0].error_summary).toBe(SCAN_NO_RESULTS_ERROR_SUMMARY);
  });

  it("marks a zero-results run as retry-exhausted once the shared cap is reached", async () => {
    // One prior recoverable failure already within the lookback window
    // (a timeout failure), so the cap (1) is already reached.
    const { service, rows } = fakeServiceClient([
      {
        id: "run-0",
        project_id: PROJECT_ID,
        status: "failed",
        error_summary: SCAN_TIMEOUT_ERROR_SUMMARY,
        started_at: "2026-06-13T09:00:00.000Z",
        created_at: "2026-06-13T09:00:00.000Z",
        updated_at: "2026-06-13T09:02:00.000Z",
        finished_at: "2026-06-13T09:02:00.000Z"
      },
      {
        id: "run-1",
        project_id: PROJECT_ID,
        status: "failed",
        error_summary: SCAN_NO_RESULTS_ERROR_SUMMARY,
        started_at: "2026-06-13T10:00:00.000Z",
        created_at: "2026-06-13T10:00:00.000Z",
        updated_at: "2026-06-13T10:01:00.000Z",
        finished_at: "2026-06-13T10:01:00.000Z"
      }
    ]);

    expect(SCAN_TIMEOUT_AUTO_RETRY_CAP).toBe(1);

    const { reconcileStuckScanRuns } = await import("./reconciliation");
    await reconcileStuckScanRuns({ projectId: PROJECT_ID, service });

    expect(createPendingScanRunCore).not.toHaveBeenCalled();
    expect(rows[1].error_summary).toBe(SCAN_NO_RESULTS_RETRY_EXHAUSTED_ERROR_SUMMARY);
  });

  it("does not retry GeminiConfigError-style terminal failures (not in RECOVERABLE_ERROR_SUMMARIES)", async () => {
    const { service, rows } = fakeServiceClient([
      {
        id: "run-1",
        project_id: PROJECT_ID,
        status: "failed",
        error_summary: "No se pudo completar la ejecución del escaneo.",
        started_at: "2026-06-13T10:00:00.000Z",
        created_at: "2026-06-13T10:00:00.000Z",
        updated_at: "2026-06-13T10:01:00.000Z",
        finished_at: "2026-06-13T10:01:00.000Z"
      }
    ]);

    const { reconcileStuckScanRuns } = await import("./reconciliation");
    await reconcileStuckScanRuns({ projectId: PROJECT_ID, service });

    expect(createPendingScanRunCore).not.toHaveBeenCalled();
    expect(rows[0].error_summary).toBe("No se pudo completar la ejecución del escaneo.");
  });

  it("still auto-retries a stale running (timeout) run as before", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T12:00:00.000Z"));

    const { service, rows } = fakeServiceClient([
      {
        id: "run-1",
        project_id: PROJECT_ID,
        status: "running",
        error_summary: null,
        started_at: "2026-06-13T11:00:00.000Z",
        created_at: "2026-06-13T11:00:00.000Z",
        updated_at: "2026-06-13T11:00:00.000Z", // > SCAN_RUNNING_TIMEOUT_SECONDS (120s) ago, no batch progress since
        finished_at: null
      }
    ]);

    const { reconcileStuckScanRuns } = await import("./reconciliation");
    const result = await reconcileStuckScanRuns({ projectId: PROJECT_ID, service });

    expect(result.reconciledCount).toBe(1);
    expect(rows[0].status).toBe("failed");
    expect(rows[0].error_summary).toBe(SCAN_TIMEOUT_ERROR_SUMMARY);
    expect(createPendingScanRunCore).toHaveBeenCalledTimes(1);
  });

  it("does NOT reconcile a running campaign whose started_at is stale but updated_at is recent (SCAN-CHAIN-1: an actively self-chaining multi-batch campaign)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T12:00:00.000Z"));

    const { service, rows } = fakeServiceClient([
      {
        id: "run-1",
        project_id: PROJECT_ID,
        status: "running",
        error_summary: null,
        started_at: "2026-06-13T11:00:00.000Z", // > SCAN_RUNNING_TIMEOUT_SECONDS (120s) ago
        created_at: "2026-06-13T11:00:00.000Z",
        updated_at: "2026-06-13T11:59:50.000Z", // last batch's progress write, 10s ago
        finished_at: null
      }
    ]);

    const { reconcileStuckScanRuns } = await import("./reconciliation");
    const result = await reconcileStuckScanRuns({ projectId: PROJECT_ID, service });

    expect(result.reconciledCount).toBe(0);
    expect(rows[0].status).toBe("running");
    expect(createPendingScanRunCore).not.toHaveBeenCalled();
  });

  it("a single reconciliation pass triggers at most one auto-retry across stale-run and zero-results passes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T12:00:00.000Z"));

    const { service, rows } = fakeServiceClient([
      {
        id: "run-stale",
        project_id: PROJECT_ID,
        status: "pending",
        error_summary: null,
        started_at: null,
        created_at: "2026-06-13T11:00:00.000Z", // > SCAN_PENDING_TIMEOUT_SECONDS (300s) ago
        updated_at: "2026-06-13T11:00:00.000Z",
        finished_at: null
      },
      {
        id: "run-no-results",
        project_id: PROJECT_ID,
        status: "failed",
        error_summary: SCAN_NO_RESULTS_ERROR_SUMMARY,
        started_at: "2026-06-13T10:00:00.000Z",
        created_at: "2026-06-13T10:00:00.000Z",
        updated_at: "2026-06-13T10:01:00.000Z",
        finished_at: "2026-06-13T10:01:00.000Z"
      }
    ]);

    const { reconcileStuckScanRuns } = await import("./reconciliation");
    await reconcileStuckScanRuns({ projectId: PROJECT_ID, service });

    // The project already has one recent recoverable failure
    // (run-no-results), which consumes the shared cap (SCAN_TIMEOUT_AUTO_RETRY_CAP=1).
    // The pending-timeout pass therefore finds the cap already reached and
    // marks run-stale exhausted without triggering a retry; the zero-results
    // pass then sees run-stale as a newer run for the project and skips
    // run-no-results entirely (already superseded).
    expect(rows[0].status).toBe("failed");
    expect(rows[0].error_summary).toBe(SCAN_PENDING_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY);
    expect(rows[1].error_summary).toBe(SCAN_NO_RESULTS_ERROR_SUMMARY);
    expect(createPendingScanRunCore).not.toHaveBeenCalled();
  });
});

describe("scanRunsNeedReconciliation — PERF-3a read-path gate", () => {
  it("returns false when there are no runs at all", () => {
    expect(scanRunsNeedReconciliation([])).toBe(false);
    expect(scanRunsNeedReconciliation(null)).toBe(false);
    expect(scanRunsNeedReconciliation(undefined)).toBe(false);
  });

  it("returns false when every run is terminal and not a zero-result failure", () => {
    expect(
      scanRunsNeedReconciliation([
        { status: "completed", error_summary: null },
        { status: "failed", error_summary: "some_other_error" }
      ])
    ).toBe(false);
  });

  it("returns true when any run is still pending or running, regardless of position", () => {
    expect(
      scanRunsNeedReconciliation([
        { status: "completed", error_summary: null },
        { status: "pending", error_summary: null }
      ])
    ).toBe(true);
    expect(scanRunsNeedReconciliation([{ status: "running", error_summary: null }])).toBe(true);
  });

  it("returns true when the latest run is a zero-result failure eligible for auto-retry", () => {
    expect(
      scanRunsNeedReconciliation([{ status: "failed", error_summary: SCAN_NO_RESULTS_ERROR_SUMMARY }])
    ).toBe(true);
  });

  it("returns false when a zero-result failure has already been superseded by a newer run", () => {
    // Runs are ordered created_at descending, so an older zero-result failure
    // that is no longer the latest row is already superseded — matches
    // reconcileStuckScanRuns' own "skip if a newer run exists" check.
    expect(
      scanRunsNeedReconciliation([
        { status: "completed", error_summary: null },
        { status: "failed", error_summary: SCAN_NO_RESULTS_ERROR_SUMMARY }
      ])
    ).toBe(false);
  });

  it("returns false when the latest run is failed but not a recoverable zero-result failure", () => {
    expect(
      scanRunsNeedReconciliation([{ status: "failed", error_summary: SCAN_NO_RESULTS_RETRY_EXHAUSTED_ERROR_SUMMARY }])
    ).toBe(false);
  });
});
