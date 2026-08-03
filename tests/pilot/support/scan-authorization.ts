/**
 * UX-PILOT-3 — the gate on the pilot launching a real scan.
 *
 * Founder, 2026-08-03: *"que el pilot aprenda a lanzar escaneos cuando lo
 * necesite… solo necesita preguntarme y yo lo autorizo."*
 *
 * A scan spends real money against Gemini, OpenAI and Anthropic and writes to
 * the production Supabase project. "The agent asks first" is a human gate, and
 * a human gate alone is a convention — one forgetful code path and the money is
 * gone. `CLAUDE.md` requires the guard be *enforced in code by an allow-list,
 * not by convention*, so both have to hold at once:
 *
 *   - **The lock.** Nothing here authorizes anything unless
 *     `PILOT_SCAN_AUTHORIZATION` is present. It is a repository secret only the
 *     founder sets, and the per-deploy workflow never passes it. A pilot run
 *     that acquires the ability to scan by accident is therefore not a code
 *     path that exists.
 *   - **The gate.** The scan journeys live in their own Playwright project,
 *     which `scripts/pilot.mjs` only ever includes for an explicit
 *     `--journeys scan`. Reaching them at all takes a deliberate manual
 *     `workflow_dispatch`.
 *
 * Refusal is loud and specific. A pilot that quietly skipped scanning would
 * report "nothing to do" for a run the founder deliberately triggered, which is
 * the same class of lie as reporting a pass for a screen nobody saw.
 */

/**
 * Hard ceiling per invocation.
 *
 * Two is not a round number: the trend chart needs two runs carrying position
 * data before it renders at all (`hasTrendData`, competitors page), and that is
 * the deepest state any journey currently needs to reach. Raising this means
 * redesigning the cost cap, not editing a constant.
 */
export const MAX_SCANS_PER_RUN = 2;

export type ScanAuthorization =
  | { authorized: true; projectId: string; scanCount: number }
  | { authorized: false; reason: string };

/**
 * Structurally compatible with `process.env` so the journey can pass it
 * straight through, while tests construct exactly the three variables that
 * matter. The index signature is what makes `ProcessEnv` assignable.
 */
export type ScanAuthorizationEnv = {
  PILOT_SCAN_AUTHORIZATION?: string;
  PILOT_SCAN_PROJECT_ID?: string;
  PILOT_SCAN_COUNT?: string;
  [key: string]: string | undefined;
};

/**
 * Decides whether this run may launch scans, and how many.
 *
 * Deliberately a pure function of the environment so the refusal paths are
 * unit-testable without a browser — the paths that must never regress are the
 * ones where it says no.
 */
export function resolveScanAuthorization(env: ScanAuthorizationEnv): ScanAuthorization {
  const token = env.PILOT_SCAN_AUTHORIZATION?.trim();
  if (!token) {
    return {
      authorized: false,
      reason:
        "PILOT_SCAN_AUTHORIZATION is not set. Launching a scan costs real money against " +
        "three providers, so it requires the founder's per-run authorization (UX-PILOT-3). " +
        "This is the expected state for every automatic per-deploy run."
    };
  }

  // A dedicated, pinned project — never the auto-discovery the read-only
  // journeys use. "Scan whatever project happens to be first" is how a pilot
  // ends up spending money on the founder's real, tracked brand.
  const projectId = env.PILOT_SCAN_PROJECT_ID?.trim();
  if (!projectId) {
    return {
      authorized: false,
      reason:
        "PILOT_SCAN_PROJECT_ID is not set. The project to scan must be named explicitly; " +
        "the pilot will not discover one to spend money on."
    };
  }

  const raw = env.PILOT_SCAN_COUNT?.trim();
  // Absent means one. A missing count must never be read as "as many as it
  // takes".
  const scanCount = raw ? Number(raw) : 1;

  if (!Number.isInteger(scanCount) || scanCount < 1) {
    return {
      authorized: false,
      reason: `PILOT_SCAN_COUNT must be a whole number of at least 1; got "${raw}".`
    };
  }

  if (scanCount > MAX_SCANS_PER_RUN) {
    return {
      authorized: false,
      reason:
        `PILOT_SCAN_COUNT is ${scanCount}, above the hard cap of ${MAX_SCANS_PER_RUN}. ` +
        "Refusing rather than silently clamping: a run that spends less than it was told to " +
        "reads as a run that did what it was asked."
    };
  }

  return { authorized: true, projectId, scanCount };
}

/**
 * One-line record of what a run was permitted to spend, for the report.
 * Cost that is not stated is cost nobody reviews.
 */
export function describeAuthorization(auth: ScanAuthorization): string {
  return auth.authorized
    ? `autorizado: hasta ${auth.scanCount} escaneo(s) sobre el proyecto ${auth.projectId}`
    : `no autorizado: ${auth.reason}`;
}
