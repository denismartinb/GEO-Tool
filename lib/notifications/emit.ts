import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import type { NotificationPayloadByType, NotificationSeverity, NotificationType } from "@/lib/notifications/types";

/**
 * Emits one notification, idempotently and without ever failing the caller.
 *
 * - Idempotent: `upsert` with `ignoreDuplicates` against the unique index on
 *   (owner_user_id, dedupe_key) (migration 0021). The scan executor
 *   self-chains and retries (SCAN-CHAIN-1), so the same emission call can run
 *   more than once — the second call is a no-op write, not a duplicate row.
 * - Never throws: any error (network, constraint, whatever) is logged and
 *   swallowed. Emitting a notification must never be the reason a scan that
 *   otherwise succeeded gets reported as failed — same fail-soft rule already
 *   applied to recommendation generation and the score-drop alert in
 *   lib/scan/executor.ts.
 * - Callers must only call this AFTER the event it describes is durable
 *   (e.g. after the `scan_runs` status update that marks a run completed),
 *   never before — see docs/specs/notifications/notifications-v1.md section 3.2.
 * - `payload` is never logged in full: it can carry data derived from a
 *   user's own prompt text.
 */
export async function emitNotification<T extends NotificationType>(
  service: ReturnType<typeof createServiceClient>,
  input: {
    ownerUserId: string;
    projectId: string | null;
    type: T;
    severity: NotificationSeverity;
    dedupeKey: string;
    payload: NotificationPayloadByType[T];
  }
): Promise<void> {
  try {
    const { error } = await service.from("notifications").upsert(
      {
        owner_user_id: input.ownerUserId,
        project_id: input.projectId,
        type: input.type,
        severity: input.severity,
        dedupe_key: input.dedupeKey,
        payload_json: input.payload
      },
      { onConflict: "owner_user_id,dedupe_key", ignoreDuplicates: true }
    );

    if (error) {
      console.error("[notifications] emit failed", {
        type: input.type,
        projectId: input.projectId,
        message: error.message
      });
    }
  } catch (error) {
    console.error("[notifications] emit threw", {
      type: input.type,
      projectId: input.projectId,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
