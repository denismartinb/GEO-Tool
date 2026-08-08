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

  const url = `${getSiteUrl()}/api/cron/run-audit`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ chainIndex })
    });

    // WEB-AUDIT-DRIVE-1: `fetch` only rejects on a transport failure. A 401
    // from Vercel's deployment protection, a 404 from a stale `getSiteUrl()`,
    // a 500 — all resolve, and without this check every one of them reads
    // exactly like a dispatch that landed. That is what made a preview deploy
    // look like it had a working audit worker when nothing was ever reachable
    // (2026-08-07). Logged, never thrown: the row is still the contract and
    // the daily sweep still recovers it.
    if (!response.ok) {
      console.error(`${LOG_PREFIX} worker dispatch was rejected`, { chainIndex, status: response.status, url });
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} failed to dispatch worker`, {
      chainIndex,
      url,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
