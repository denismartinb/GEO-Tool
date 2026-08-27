/**
 * Contract for `notifications.payload_json` (supabase/migrations/0021_notifications.sql).
 * Payloads store facts, never rendered copy — see docs/specs/notifications/notifications-v1.md
 * section 3.1 (D4): the Spanish copy is derived from these fields at read time
 * (lib/notifications/render.ts, phase 1b), so wording can be fixed without a
 * data migration.
 *
 * All 8 types are declared here even though phase 1a only emits the first
 * four (scan_completed, scan_failed, gap_resolved, gap_pending) — the rest
 * are wired in phase 2/3, and the migration's CHECK constraint already
 * allows them.
 */
export type NotificationSeverity = "success" | "info" | "warning" | "critical";

/**
 * Row limits for the two read surfaces (NOTIF-SERVER-1b). Kept here — not in
 * lib/project-workspace.ts, which has `import "server-only"` — because
 * components/notification-bell.tsx (a Client Component) needs
 * NOTIFICATIONS_BELL_LIMIT too, and a value import from a server-only module
 * breaks the client/server boundary at build time.
 */
export const NOTIFICATIONS_BELL_LIMIT = 15;
export const NOTIFICATIONS_PAGE_LIMIT = 50;

export type NotificationPayloadByType = {
  scan_completed: {
    runId: string;
    promptsProcessed: number;
    providers: string[];
    /** TRUST-METRICS-1: the windowed "Puntuación GEO" — the only figure this
     *  notification may headline. `undefined` for rows persisted before this
     *  field existed; `render.ts` falls back to `visibilityScore` for those,
     *  never the reverse. */
    geoScore?: number;
    /** Kept as the documented fallback for notification rows persisted
     *  before `geoScore` existed in this payload, and for the delta's icon
     *  direction — never rendered as the number under "Puntuación GEO"
     *  (docs/external-audit-2026-08.md, Fase 1). NOT for `weekly-digest.ts`:
     *  that reads `run_scores` directly via `getEffectiveGeoScore` and never
     *  touches this notification payload at all (corrected during review —
     *  the original comment here named the wrong consumer). */
    visibilityScore: number | null;
    visibilityDelta: number | null;
    newRecommendations: number;
    resolvedGaps: number;
  };
  scan_failed: {
    runId: string;
    /** Already sanitized via getSanitizedScanError — never a raw error message. */
    errorSummary: string;
  };
  gap_resolved: {
    runId: string;
    count: number;
    /** Titles of up to 3 of the resolved recommendations, for the body copy. */
    sampleTitles: string[];
  };
  gap_pending: {
    recommendationTitle: string;
    consecutiveRuns: number;
    impact: "low" | "medium" | "high";
  };
  emerging_competitor: {
    competitor: string;
    promptCount: number;
  };
  ai_bot_blocked: {
    agent: string;
    snapshotId: string;
  };
  audit_completed: {
    snapshotId: string;
    readinessScore: number | null;
    pagesAnalyzed: number;
  };
  trial_ending: {
    daysLeft: number;
    trialEndsAt: string;
  };
  /**
   * WEB-AUDIT-ALERTS-1 — audit-to-audit regressions (migration 0029), all
   * derived by comparing the two most recent audits of a project
   * (lib/web-audit/regressions.ts). Every one carries the snapshot it was
   * detected on: it is the dedupe key's discriminator, and it is what lets a
   * future reader tie a notice back to the exact audit that produced it.
   */
  coverage_dropped: {
    /**
     * The scan whose coverage map this was detected on — NOT a snapshot id.
     * The coverage half of an audit is a per-scan artifact that a repeated
     * technical audit does not regenerate, so keying it by snapshot would
     * re-notify the same regression on every re-audit of the same scan.
     */
    scanId: string;
    /** Topics that went from conclusively covered to conclusively not covered. */
    count: number;
    /** Up to 3 of those topics' labels, for the body copy. */
    sampleTopics: string[];
  };
  surfacing_dropped: {
    scanId: string;
    /** Topics that went from `performing` to `invisible`. */
    count: number;
    sampleTopics: string[];
  };
  llms_txt_lost: {
    snapshotId: string;
  };
  sitemap_lost: {
    snapshotId: string;
  };
  page_unreachable: {
    snapshotId: string;
    /** Pages analyzed in the previous audit that did not answer in this one. */
    count: number;
    sampleUrls: string[];
  };
};

export type NotificationType = keyof NotificationPayloadByType;
