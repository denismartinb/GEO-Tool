import "server-only";

import { getSiteUrl } from "@/lib/site-url";

/**
 * AUDIT-AFTER-SCAN-1 — dispatch side of the post-scan audit worker.
 *
 * Lives in its own module (rather than inside the route or the runner) so
 * both the scan executor and the worker route can call it without either
 * importing the other: the route imports the runner, the runner must not
 * import the route, and the executor imports neither.
 */

const LOG_PREFIX = "[geo:audit-after-scan]";

/**
 * Kill switch for the automatic post-scan audit. Default ON: the founder's
 * requirement is that this "simplemente funcione" after every scan, and a
 * feature that silently needs an env var set in three environments to do
 * anything is a feature that will be found broken later. `"false"` disables
 * it — the escape hatch exists for cost, since every automatic audit spends
 * real Gemini grounding calls.
 */
export function isAutoWebAuditEnabled(): boolean {
  return process.env.AUTO_WEB_AUDIT_ENABLED !== "false";
}

/**
 * Fire the audit worker without waiting for it. Call from inside `after()`,
 * so the caller's own response has already been sent.
 *
 * Errors are logged and swallowed: a lost dispatch is not a lost audit. The
 * job row stays 'pending' and due, and the daily sweep picks it up — the
 * whole reason the work is queued rather than run inline.
 */
export async function triggerWebAuditRun({ chainIndex = 0 }: { chainIndex?: number } = {}): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(`${LOG_PREFIX} cannot dispatch worker: CRON_SECRET is not configured`);
    return;
  }

  try {
    await fetch(`${getSiteUrl()}/api/cron/run-audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ chainIndex })
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} failed to dispatch worker`, {
      chainIndex,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
