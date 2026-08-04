import type { requireUser } from "@/lib/auth";

export type ProjectActionErrorCode =
  | "active_run_exists"
  | "free_plan_scan_limit_reached"
  | "project_archived"
  | "project_not_found"
  | "prompts_required"
  | "scan_failed"
  | "scan_failed_no_results"
  | "scan_unavailable"
  | "unauthorized"
  | "unexpected_error";

export class ProjectActionError extends Error {
  constructor(public readonly code: ProjectActionErrorCode) {
    super(code);
    this.name = "ProjectActionError";
  }
}

export type RunErrorDisplayKind = "notice" | "error";

export type RunErrorDisplay = {
  message: string;
  /**
   * "notice" — a neutral, non-alarming message (e.g. a timeout that is being
   * auto-retried). Callers should render this with a calmer visual treatment
   * (no warning colors/icon).
   * "error" — a genuine terminal failure (retry-exhausted timeout, or any
   * other non-timeout failure). Callers should render this with the existing
   * error styling.
   */
  kind: RunErrorDisplayKind;
};

export type AuthenticatedContext = Awaited<ReturnType<typeof requireUser>>;

export type JobRow = {
  id: string;
  job_type: "scan_start" | "scan_prompt" | "scan_finalize";
  status: "pending" | "running" | "retrying" | "completed" | "failed" | "cancelled";
  attempt_count: number;
  max_attempts: number;
  payload_json: Record<string, unknown>;
};

export type ScanPromptResultRow = {
  id: string;
  raw_response_text: string | null;
  raw_response_json: {
    grounding_chunks?: Array<{ uri?: string; title?: string }>;
  } | null;
  prompt_text_snapshot: string;
  brand_snapshot: string;
  /** projects.brand_aliases frozen at scan time (GEO-SCORE-BRAND-IDENTITY-1). Optional for rows written before migration 0025. */
  brand_aliases_snapshot?: string[] | null;
  competitors_snapshot: Array<{ name?: string }> | null;
  provider: string;
  status: string;
  extraction_version: string;
  /**
   * SCAN-CHAIN-2 (docs/adr/0027): a non-null value here means a PRIOR
   * extraction attempt for this row already failed and persisted this
   * sanitized error. Such a row must never be treated as "eligible" for
   * another extraction attempt within the same run — its
   * `extraction_version` never advances past the failure (see
   * `extractAndPersistRow`), so without this field a batched, re-queuing
   * extraction pass would pick the same failed row again on every single
   * batch, forever, instead of moving on to the next batch of genuinely
   * unprocessed rows.
   */
  extraction_error: string | null;
};
