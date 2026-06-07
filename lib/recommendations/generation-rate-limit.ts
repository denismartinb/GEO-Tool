import type { createServiceClient } from "@/lib/supabase/service";

/**
 * Rate-limiting guard for AI-generated "solutions" (Phase 2 pipeline).
 *
 * Deliberately NOT marked `import "server-only"`: this module is pure logic
 * over an injected client (see `recommendation-engine.ts` for the same
 * pattern in this directory) and must be importable from Vitest, which has no
 * `server-only` shim (unlike the Next.js build). The actual server-only
 * boundary is enforced one layer down, at the only thing this module requires
 * — `createServiceClient` in `lib/supabase/service.ts` — so a client component
 * could not construct a valid argument for this function in the first place.
 *
 * Phase 0 deliberately did NOT create a dedicated quotas table — `data-guardian`
 * recommended counting directly via the existing
 * `gensol_project_created_status_idx (project_id, created_at, status)` index,
 * which makes a windowed count-per-project query an efficient index range scan
 * with no extra schema surface.
 *
 * This module is PURE GUARD LOGIC: given a Supabase client and a project id, it
 * answers "is this project allowed to start another generation right now?" in a
 * single synchronous-from-the-caller's-perspective awaited call. It performs NO
 * writes, calls no LLM, and renders nothing — Phase 2 is expected to call
 * `checkGenerationRateLimit` immediately before invoking Gemini and to bail out
 * (persisting a `failed`/blocked state with a sanitized reason) when
 * `allowed === false`.
 *
 * Sync-pipeline note (ADR-0003): because scans (and, later, generations) run
 * synchronously inside a `maxDuration`-bounded request, this guard must resolve
 * quickly and deterministically — a single indexed count query, no polling, no
 * background bookkeeping.
 */

export type GenerationRateLimitWindow = "day";

export type GenerationRateLimitConfig = {
  /** Rolling window over which generations are counted. */
  window: GenerationRateLimitWindow;
  /** Max number of generations (any status) allowed per project within the window. */
  maxPerWindow: number;
};

/**
 * Default limits for Phase 2 planning purposes.
 *
 * 20 generations / project / rolling 24h.
 *
 * Why this number:
 * - A full scan surfaces at most a handful of high-priority recommendations
 *   (recommendation-engine caps and ranks them); generating a "solution" for
 *   each of the realistic top candidates in a day comfortably fits well under
 *   20, even allowing for re-generation after edits/dismissals.
 * - It is generous enough that a normal beta user driving the core flow
 *   (scan → review recommendations → request solutions) never notices the
 *   limit, but tight enough to bound Gemini cost and abuse blast radius for a
 *   single project to a small, predictable number of LLM calls per day.
 * - A 24h rolling window (rather than calendar-day) avoids the classic
 *   "burst right at midnight" loophole while staying simple to reason about
 *   and to explain in a UI message later ("try again in N hours").
 *
 * These are intentionally conservative starting values for private beta and
 * should be revisited with real usage data before/at Phase 2 rollout.
 */
export const DEFAULT_GENERATION_RATE_LIMIT: GenerationRateLimitConfig = {
  window: "day",
  maxPerWindow: 20
};

const WINDOW_MS: Record<GenerationRateLimitWindow, number> = {
  day: 24 * 60 * 60 * 1000
};

export type GenerationRateLimitResult =
  | {
      allowed: true;
      /** Generations already counted within the current window. */
      count: number;
      /** Configured max for the window (echoed back for the caller/UI). */
      limit: number;
      /** How many more generations may be started before the limit is hit. */
      remaining: number;
      /** ISO timestamp marking the start of the counting window. */
      windowStart: string;
    }
  | {
      allowed: false;
      reason: "rate_limit_exceeded";
      count: number;
      limit: number;
      remaining: 0;
      /**
       * ISO timestamp marking the start of the counting window that produced
       * this verdict. Deliberately NOT a `resetAt`/`retryAt`: a precise "you
       * can try again at T" requires knowing the timestamp of the oldest row
       * inside the window (a second query), which would turn this guard into
       * two round-trips. `windowStart + window length` is NOT a valid
       * approximation — for a rolling window anchored at "now" it always
       * collapses to "now", which would tell a blocked caller to retry
       * immediately. Callers/UI should phrase messaging in terms of the
       * window (e.g. "limit resets on a rolling Nh basis") rather than a
       * specific instant.
       */
      windowStart: string;
    }
  | {
      allowed: false;
      reason: "rate_limit_check_failed";
      /** Sanitized — never the raw Postgres/provider error. No raw errors leak past this guard. */
      error: "rate_limit_lookup_failed";
    };

export type GenerationRateLimitDeps = {
  /** Injectable for tests; defaults to `Date.now`. */
  now?: () => number;
  /** Injectable for tests; defaults to `DEFAULT_GENERATION_RATE_LIMIT`. */
  config?: GenerationRateLimitConfig;
};

const LOG_PREFIX = "[geo:gensol-rate-limit]";

/**
 * Counts recent `generated_solutions` rows for a project within the configured
 * rolling window (using `gensol_project_created_status_idx`) and returns a
 * typed, side-effect-free verdict the Phase 2 pipeline can branch on
 * synchronously before calling Gemini.
 *
 * Fail-closed: any lookup error blocks the generation rather than silently
 * allowing unbounded calls. The error is sanitized — callers must not surface
 * raw Supabase/Postgres errors to logs or UI (see `reliability` rules).
 */
export async function checkGenerationRateLimit(
  service: ReturnType<typeof createServiceClient>,
  projectId: string,
  deps: GenerationRateLimitDeps = {}
): Promise<GenerationRateLimitResult> {
  const config = deps.config ?? DEFAULT_GENERATION_RATE_LIMIT;
  const nowMs = (deps.now ?? Date.now)();
  const windowStartMs = nowMs - WINDOW_MS[config.window];
  const windowStart = new Date(windowStartMs).toISOString();

  const { count, error } = await service
    .from("generated_solutions")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .gte("created_at", windowStart);

  if (error) {
    console.error(`${LOG_PREFIX} lookup_failed`, {
      project_id: projectId,
      window: config.window
    });
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
