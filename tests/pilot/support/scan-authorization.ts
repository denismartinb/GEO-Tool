/**
 * UX-PILOT-3 — the gate on the pilot launching a real scan.
 *
 * Founder, 2026-08-03: *"que el pilot aprenda a lanzar escaneos cuando lo
 * necesite"* and then, on the first design: *"tiene que dar al botón como si le
 * diera yo, sin claves ni secretos."*
 *
 * The first version required a `PILOT_SCAN_AUTHORIZATION` secret on top of the
 * manual dispatch. That was dropped, and dropping it was right: anyone able to
 * set a repository secret is already able to trigger the workflow, so the
 * secret bought no access control that `workflow_dispatch` did not already
 * provide. It only added a setup step that made the capability harder to use
 * than pressing the button by hand — which defeats the point.
 *
 * WHAT STILL HOLDS, in code rather than by convention:
 *
 *   - **The always-on pilot cannot reach this at all.** The scan journeys live
 *     in their own Playwright project, which `scripts/pilot.mjs` includes only
 *     for an explicit `--journeys scan`, in a workflow with no
 *     `deployment_status` trigger. No preview deploy can spend money.
 *   - **The target is never discovered.** `PILOT_SCAN_PROJECT_ID` is a required
 *     input with no default. "Scan whatever project is first" is how a pilot
 *     ends up spending money on the founder's real tracked brand.
 *   - **The cap is refused, not clamped.** More than `MAX_SCANS_PER_RUN` is an
 *     error; silently scanning fewer times than instructed would read as a run
 *     that did what it was asked.
 *
 * WHAT NO LONGER HOLDS, stated plainly rather than glossed: nothing in code
 * distinguishes a human pressing "Run workflow" from an agent dispatching it
 * with a repository token. That distinction was what the secret bought, and the
 * founder traded it away deliberately so the pilot can do this itself. The
 * remaining protection is that dispatching requires repository write access and
 * that the run announces, in the PR comment, exactly what it spent.
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
 * straight through, while tests construct exactly the two variables that
 * matter. The index signature is what makes `ProcessEnv` assignable.
 */
export type ScanAuthorizationEnv = {
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
  // The single most important refusal: absent means "no scan", never "pick
  // one". Every other run of the harness — every preview deploy — passes an
  // environment without this, and must come out the other side having spent
  // nothing.
  const projectId = env.PILOT_SCAN_PROJECT_ID?.trim();
  if (!projectId) {
    return {
      authorized: false,
      reason:
        "PILOT_SCAN_PROJECT_ID is not set. The project to scan must be named explicitly; " +
        "the pilot will not discover one to spend money on. This is the expected state for " +
        "every automatic per-deploy run."
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
