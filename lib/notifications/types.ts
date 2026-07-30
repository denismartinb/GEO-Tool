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
};

export type NotificationType = keyof NotificationPayloadByType;
