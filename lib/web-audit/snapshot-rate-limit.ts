import type { createServiceClient } from "@/lib/supabase/service";

/**
 * Rate-limiting guard for `web_audit_snapshots` (WEB-AUDIT-2). Sibling of
 * `lib/recommendations/generation-rate-limit.ts` rather than a reuse of it —
 * different table, same windowed-count-over-an-indexed-column shape
 * (data-guardian: one row per run means count === runs, no double-count
 * subtlety, since every technical audit persists unconditionally regardless
 * of outcome — see technical-audit.ts).
 *
 * Deliberately NOT marked `import "server-only"`: pure logic over an injected
 * client, importable from Vitest (same rationale as the sibling module this
 * mirrors). The actual server-only boundary is enforced one layer down, at
 * `createServiceClient`.
 */

export type SnapshotRateLimitWindow = "day";

export type SnapshotRateLimitConfig = {
  window: SnapshotRateLimitWindow;
  maxPerWindow: number;
};

export const DEFAULT_SNAPSHOT_RATE_LIMIT: SnapshotRateLimitConfig = {
  window: "day",
  maxPerWindow: 5
};

const WINDOW_MS: Record<SnapshotRateLimitWindow, number> = {
  day: 24 * 60 * 60 * 1000
};

export type SnapshotRateLimitResult =
  | {
      allowed: true;
      count: number;
      limit: number;
      remaining: number;
      windowStart: string;
    }
  | {
      allowed: false;
      reason: "rate_limit_exceeded";
      count: number;
      limit: number;
      remaining: 0;
      windowStart: string;
    }
  | {
      allowed: false;
      reason: "rate_limit_check_failed";
      error: "rate_limit_lookup_failed";
    };

export type SnapshotRateLimitDeps = {
  now?: () => number;
  config?: SnapshotRateLimitConfig;
};

const LOG_PREFIX = "[geo:web-audit-snapshot-rate-limit]";

/**
 * Counts recent `web_audit_snapshots` rows for a project within the
 * configured rolling window (via `web_audit_project_created_idx`) and
 * returns a typed verdict. Fail-closed: a lookup error blocks the audit
 * rather than allowing unbounded fetches.
 */
export async function checkSnapshotRateLimit(
  service: ReturnType<typeof createServiceClient>,
  projectId: string,
  deps: SnapshotRateLimitDeps = {}
): Promise<SnapshotRateLimitResult> {
  const config = deps.config ?? DEFAULT_SNAPSHOT_RATE_LIMIT;
  const nowMs = (deps.now ?? Date.now)();
  const windowStartMs = nowMs - WINDOW_MS[config.window];
  const windowStart = new Date(windowStartMs).toISOString();

  const { count, error } = await service
    .from("web_audit_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .gte("created_at", windowStart);

  if (error) {
    console.error(`${LOG_PREFIX} lookup_failed`, { project_id: projectId, window: config.window });
    return { allowed: false, reason: "rate_limit_check_failed", error: "rate_limit_lookup_failed" };
  }

  const used = count ?? 0;

  if (used >= config.maxPerWindow) {
    console.warn(`${LOG_PREFIX} blocked`, {
      project_id: projectId,
      window: config.window,
      count: used,
      limit: config.maxPerWindow
    });
    return {
      allowed: false,
      reason: "rate_limit_exceeded",
      count: used,
      limit: config.maxPerWindow,
      remaining: 0,
      windowStart
    };
  }

  return {
    allowed: true,
    count: used,
    limit: config.maxPerWindow,
    remaining: config.maxPerWindow - used,
    windowStart
  };
}
