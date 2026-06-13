import type { requireUser } from "@/lib/auth";

export type ProjectActionErrorCode =
  | "active_run_exists"
  | "project_archived"
  | "project_not_found"
  | "prompts_required"
  | "scan_failed"
  | "scan_unavailable"
  | "too_many_prompts"
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
  prompt_text_snapshot: string;
  brand_snapshot: string;
  competitors_snapshot: Array<{ name?: string }> | null;
  provider: string;
  status: string;
  extraction_version: string;
};
